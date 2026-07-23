import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
try:
    from authlib.integrations.starlette_client import OAuth
except Exception:
    OAuth = None

from app.database import get_db
from app.models.user import User, UserRole
from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.schemas.user import TokenResponse, UserResponse, SignupRequest, LoginRequest
from app.config import settings

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
        client_kwargs={"scope": "openid email profile"},
    )


# ── Email / Password ────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    """
    Create an account with email + password. If an account with this
    email already exists from Google sign-in (no password set yet), this
    *links* a password to it instead of failing — meaning a Google user
    can also add password login to the same account, never creating a
    duplicate. If a password is already set, signup is rejected in favor
    of the login flow.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalar_one_or_none()

    if existing:
        if existing.hashed_password:
            raise HTTPException(409, "An account with this email already exists. Try logging in instead.")
        # Google-only account — link a password to it rather than duplicating.
        existing.hashed_password = hash_password(body.password)
        if body.name and not existing.name:
            existing.name = body.name
        await db.commit()
        await db.refresh(existing)
        token = create_access_token(existing.id, is_guest=False)
        return TokenResponse(access_token=token, user=UserResponse.model_validate(existing))

    user = User(
        id=str(uuid.uuid4()),
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name or body.email.split("@")[0],
        role=UserRole.USER,
        is_guest=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, is_guest=False)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
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

    token = create_access_token(user.id, is_guest=False)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


# ── Google OAuth ─────────────────────────────────────────────────────────────

@router.get("/google")
async def google_login(request: Request):
    if oauth is None:
        raise HTTPException(501, "Google OAuth dependencies are not installed")
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(501, "Google OAuth not configured")
    if settings.ENVIRONMENT == "production":
        redirect_uri = "https://lecture-map-backend.onrender.com/auth/google/callback"
    else:
        redirect_uri = "http://localhost:8000/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    if oauth is None:
        raise HTTPException(501, "Google OAuth dependencies are not installed")
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {e}")

    user_info = token.get("userinfo") or await oauth.google.userinfo(token=token)

    google_id = user_info.get("sub")
    email = user_info.get("email")
    name = user_info.get("name")
    avatar_url = user_info.get("picture")

    # Get or create user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user:
        user.google_id = google_id
        user.name = name
        user.avatar_url = avatar_url
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

    access_token = create_access_token(user.id, is_guest=False)
    redirect_url = f"{settings.FRONTEND_URL}/auth/success?token={access_token}"
    return RedirectResponse(url=redirect_url)


# ── Guest Mode ────────────────────────────────────────────────────────────────

@router.post("/guest", response_model=TokenResponse)
async def create_guest(db: AsyncSession = Depends(get_db)):
    """Create an ephemeral guest user with a 24-hour token."""
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

    token = create_access_token(user.id, is_guest=True)
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """End a guest session immediately and clear its temporary data."""
    if current_user.is_guest:
        await db.delete(current_user)
        await db.commit()
    return {"message": "Signed out"}


# ── Current User ──────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
