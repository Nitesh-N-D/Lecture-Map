import json
import uuid
from datetime import datetime, timedelta
import logging
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
try:
    from authlib.integrations.starlette_client import OAuth
except Exception:
    OAuth = None

from app.database import get_db
from app.models.user import User, UserRole
from app.models.lecture import Lecture
from app.models.flashcard import Flashcard
from app.neo4j_client import neo4j_client
from app.services.storage import delete_file
from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.schemas.user import TokenResponse, UserResponse, SignupRequest, LoginRequest
from app.config import deployment_urls, settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# ── OAuth Setup ─────────────────────────────────────────────────────────────
oauth = OAuth() if OAuth else None
if oauth and settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
    oauth.register(
        name="google",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile", "code_challenge_method": "S256"},
    )


# ── Email / Password ────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Create an account with email + password. Existing emails are always
    rejected (see below); accounts are never merged on an unverified email.
    """
    email = body.email.strip().lower()
    result = await db.execute(select(User).where(func.lower(User.email) == email))
    existing = result.scalar_one_or_none()

    if existing:
        # Never attach a password to an existing account: the email address has
        # not been verified here, so doing so would let anyone pre-claim (or take
        # over) an account that belongs to someone else.
        if existing.hashed_password:
            raise HTTPException(409, "An account with this email already exists. Try logging in instead.")
        raise HTTPException(
            409,
            "This email is registered with Google sign-in. Use 'Continue with Google' to sign in.",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=email,
        hashed_password=hash_password(body.password),
        name=body.name or email.split("@")[0],
        role=UserRole.USER,
        is_guest=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, is_guest=False, token_version=user.token_version or 0)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(func.lower(User.email) == body.email.strip().lower()))
    user = result.scalar_one_or_none()

    # Same generic error whether the email doesn't exist or the password
    # is wrong — avoids leaking which emails are registered.
    invalid_creds = HTTPException(401, "Incorrect email or password")

    if not user:
        raise invalid_creds

    if not user.hashed_password:
        # Account exists but was created via Google only — guide them
        # to the right flow instead of a confusing generic failure.
        raise HTTPException(
            400,
            "This account uses Google sign-in. Use 'Sign in with Google', "
            "or sign up with a password to add one to this account.",
        )

    if not verify_password(body.password, user.hashed_password):
        raise invalid_creds

    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")

    token = create_access_token(user.id, is_guest=False, token_version=user.token_version or 0)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


# ── Google OAuth ─────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login(request: Request):
    if oauth is None:
        raise HTTPException(501, "Google OAuth dependencies are not installed")
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(501, "Google OAuth not configured")
    _, backend = deployment_urls(request.headers.get("host"))
    redirect_uri = f"{backend}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def _google_claims_valid(claims) -> bool:
    """Defence in depth on top of Authlib's id_token verification: when issuer or
    audience claims are present they must be Google and this app's client id."""
    issuer = claims.get("iss")
    if issuer is not None and issuer not in GOOGLE_ISSUERS:
        return False
    audience = claims.get("aud")
    if audience is not None:
        audiences = audience if isinstance(audience, (list, tuple)) else [audience]
        if settings.GOOGLE_CLIENT_ID not in audiences:
            return False
    return True


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    if oauth is None:
        raise HTTPException(501, "Google OAuth dependencies are not installed")
    frontend, _ = deployment_urls(request.headers.get("host"))
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        logger.warning("Google OAuth callback failed: %s", e)
        query = urlencode({"error": "google_oauth_failed"})
        return RedirectResponse(f"{frontend}/auth/success?{query}")

    user_info = token.get("userinfo") or await oauth.google.userinfo(token=token)

    if not _google_claims_valid(user_info):
        logger.warning("Google OAuth claims failed issuer/audience validation")
        query = urlencode({"error": "google_identity_unavailable"})
        return RedirectResponse(f"{frontend}/auth/success?{query}")

    google_id = user_info.get("sub")
    email = (user_info.get("email") or "").strip().lower()
    name = user_info.get("name")
    avatar_url = user_info.get("picture")

    if not google_id or not email or user_info.get("email_verified") is not True:
        logger.warning("Google OAuth response did not include a verified identity")
        query = urlencode({"error": "google_identity_unavailable"})
        return RedirectResponse(f"{frontend}/auth/success?{query}")

    # Get or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email
        result = await db.execute(select(User).where(func.lower(User.email) == email))
        user = result.scalar_one_or_none()

    if user and not user.is_active:
        query = urlencode({"error": "account_deactivated"})
        return RedirectResponse(f"{frontend}/auth/success?{query}")

    if user:
        if not user.google_id:
            # First Google sign-in for an existing email account. Google has
            # verified the address, but the password set at signup was never
            # verified, so drop it: whoever controls the mailbox now owns the account.
            # Also revoke any session opened with that password.
            user.hashed_password = None
            user.token_version = (user.token_version or 0) + 1
        user.google_id = google_id
        user.name = user.name or name
        user.avatar_url = user.avatar_url or avatar_url
        user.is_guest = False
        await db.commit()
        await db.refresh(user)
    else:
        user = User(
            id=str(uuid.uuid4()),
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
            role=UserRole.USER,
            is_guest=False,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(user.id, is_guest=False, token_version=user.token_version or 0)
    # Fragment, not query: fragments are never sent to servers or written to access logs.
    redirect_url = f"{frontend}/auth/success#{urlencode({'token': access_token})}"
    return RedirectResponse(url=redirect_url)


# ── Guest Mode ────────────────────────────────────────────────────────────────

async def purge_expired_guests(db: AsyncSession, limit: int = 50) -> int:
    """Delete guest accounts (and, by cascade, their data) past the retention window."""
    cutoff = datetime.utcnow() - timedelta(hours=settings.GUEST_RETENTION_HOURS)
    result = await db.execute(
        select(User).where(User.is_guest.is_(True), User.created_at < cutoff).limit(limit)
    )
    guests = result.scalars().all()
    for guest in guests:
        await db.delete(guest)
    if guests:
        await db.commit()
    return len(guests)



@router.post("/guest", response_model=TokenResponse)
async def create_guest(db: AsyncSession = Depends(get_db)):
    """Create an ephemeral guest user with a 24-hour token."""
    await purge_expired_guests(db)
    guest_id = str(uuid.uuid4())
    user = User(
        id=guest_id,
        email=None,
        name="Guest User",
        avatar_url=None,
        role=UserRole.GUEST,
        is_guest=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, is_guest=True, token_version=user.token_version or 0)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Sign out. Guest accounts are deleted immediately; for everyone else the
    token version is bumped, which invalidates every token issued so far."""
    if current_user.is_guest:
        await _erase_user(db, current_user)
    else:
        current_user.token_version = (current_user.token_version or 0) + 1
        await db.commit()
    return {"message": "Signed out"}


async def _erase_user(db: AsyncSession, user: User) -> None:
    """Delete a user with all owned data: DB rows, uploaded files, graph mirror."""
    lectures = (await db.execute(select(Lecture).where(Lecture.user_id == user.id))).scalars().all()
    refs = [lec.storage_path for lec in lectures]
    for lec in lectures:
        try:
            await neo4j_client.delete_lecture_graph(lec.id)
        except Exception as error:  # optional mirror; never blocks erasure
            logger.warning("Neo4j cleanup failed during account deletion: %s", type(error).__name__)
    await db.delete(user)  # ORM cascade removes lectures, flashcards, study sessions
    await db.commit()
    for ref in refs:
        await run_in_threadpool(delete_file, ref)


# ── Current User ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


# ── Privacy: data export and account deletion ────────────────────────────────

class DeleteAccountRequest(BaseModel):
    confirm: str
    password: str | None = None


def _iso(value):
    return value.isoformat() if value else None


@router.get("/me/export")
async def export_my_data(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Machine-readable copy of everything stored about the signed-in user."""
    lectures = (
        await db.execute(select(Lecture).where(Lecture.user_id == current_user.id).order_by(Lecture.created_at))
    ).scalars().all()
    ids = [lec.id for lec in lectures]
    cards = []
    if ids:
        cards = (await db.execute(select(Flashcard).where(Flashcard.lecture_id.in_(ids)))).scalars().all()

    def load(raw, default):
        try:
            return json.loads(raw) if raw else default
        except json.JSONDecodeError:
            return default

    payload = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "account": {
            "id": current_user.id,
            "email": current_user.email,
            "name": current_user.name,
            "is_guest": current_user.is_guest,
            "sign_in_methods": [
                m for m, on in (("password", bool(current_user.hashed_password)), ("google", bool(current_user.google_id))) if on
            ],
            "created_at": _iso(current_user.created_at),
        },
        "lectures": [
            {
                "id": lec.id,
                "title": lec.title,
                "original_filename": lec.original_filename,
                "status": lec.status.value if hasattr(lec.status, "value") else str(lec.status),
                "created_at": _iso(lec.created_at),
                "transcript": lec.transcript,
                "graph": load(lec.graph_data, None),
                "studied_concept_ids": load(lec.visited_concept_ids, []),
            }
            for lec in lectures
        ],
        "flashcards": [
            {
                "id": c.id, "lecture_id": c.lecture_id, "concept_id": c.concept_id, "question": c.question,
                "answer": c.answer, "repetitions": c.repetitions, "interval_days": c.interval_days,
                "easiness_factor": c.easiness_factor, "total_reviews": c.total_reviews,
                "next_review_at": _iso(c.next_review_at), "last_reviewed_at": _iso(c.last_reviewed_at),
            }
            for c in cards
        ],
    }
    return JSONResponse(
        payload,
        headers={"Content-Disposition": 'attachment; filename="lecturemap-data-export.json"', "Cache-Control": "no-store"},
    )


@router.delete("/me")
async def delete_my_account(
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the account and all of its data."""
    if body.confirm != "DELETE":
        raise HTTPException(400, "Type DELETE to confirm account deletion")
    if current_user.hashed_password and not (body.password and verify_password(body.password, current_user.hashed_password)):
        raise HTTPException(403, "Enter your current password to delete this account")
    await _erase_user(db, current_user)
    return {"message": "Account and all associated data deleted"}
