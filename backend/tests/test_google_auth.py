"""Google sign-in callback behaviour against a mocked identity provider.

Nothing here contacts Google: Authlib's token exchange is replaced with a double,
so these tests cover LectureMap's own handling (claim checks, account linking,
redirects) and NOT Google's real consent/token endpoints. The state/PKCE/nonce/
signature checks themselves are Authlib's and are only exercised through the
"no state in session" case.
"""
import asyncio
import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.main import app
from app.models.user import User
from app.routers import auth as auth_router

FRONTEND = "http://frontend.test"


@pytest.fixture(scope="module")
def client():
    with TestClient(app, follow_redirects=False) as c:
        yield c


def claims(**over):
    base = {
        "iss": "https://accounts.google.com",
        "aud": settings.GOOGLE_CLIENT_ID,
        "sub": uuid.uuid4().hex,
        "email": f"{uuid.uuid4().hex[:8]}@example.com",
        "email_verified": True,
        "name": "Test Person",
        "picture": "https://example.com/p.png",
    }
    base.update(over)
    return base


@pytest.fixture
def idp(monkeypatch):
    """Make the mocked IdP return the given claims, or raise the given error."""
    google = auth_router.oauth.google

    def set_result(userinfo=None, error=None):
        async def fake_exchange(request, **kw):
            if error:
                raise error
            return {"userinfo": userinfo}

        monkeypatch.setattr(google, "authorize_access_token", fake_exchange)

    return set_result


def db_run(fn):
    async def run():
        async with AsyncSessionLocal() as db:
            return await fn(db)

    return asyncio.run(run())


def _first(stmt):
    async def go(db):
        return (await db.execute(stmt)).scalar_one_or_none()

    return go


def user_by_email(email):
    return db_run(_first(select(User).where(User.email == email)))


def callback(client):
    return client.get("/auth/google/callback?code=abc&state=xyz")


def error_of(response):
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert location.startswith(f"{FRONTEND}/auth/success?")
    assert "#" not in location and "token" not in location
    return parse_qs(urlparse(location).query)["error"][0]


def token_of(response):
    assert response.status_code in (302, 307)
    parsed = urlparse(response.headers["location"])
    assert f"{parsed.scheme}://{parsed.netloc}" == FRONTEND
    assert parsed.path == "/auth/success"
    assert parsed.query == "", "token must not appear in the query string"
    return parse_qs(parsed.fragment)["token"][0]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_new_user_signs_in_with_token_in_fragment_only(client, idp):
    info = claims()
    idp(info)
    token = token_of(callback(client))
    me = client.get("/auth/me", headers=bearer(token))
    assert me.status_code == 200
    assert me.json()["email"] == info["email"]
    row = user_by_email(info["email"])
    assert row.google_id == info["sub"] and row.hashed_password is None and not row.is_guest


def test_returning_google_user_reuses_account(client, idp):
    info = claims()
    idp(info)
    first = client.get("/auth/me", headers=bearer(token_of(callback(client)))).json()["id"]
    second = client.get("/auth/me", headers=bearer(token_of(callback(client)))).json()["id"]
    assert first == second


def test_email_case_does_not_create_duplicate(client, idp):
    info = claims(email=f"Mixed{uuid.uuid4().hex[:6]}@Example.com")
    idp(info)
    token_of(callback(client))
    idp({**info, "sub": info["sub"], "email": info["email"].lower()})
    token_of(callback(client))
    rows = db_run(lambda db: db.execute(select(User).where(User.google_id == info["sub"])))
    assert len(rows.scalars().all()) == 1


def test_linking_existing_password_account_drops_password_and_old_sessions(client, idp):
    email = f"{uuid.uuid4().hex[:8]}@example.com"
    signup = client.post("/auth/signup", json={"email": email, "password": "correct-horse-1"})
    old_token = signup.json()["access_token"]
    idp(claims(email=email))
    new_token = token_of(callback(client))

    assert client.get("/auth/me", headers=bearer(new_token)).status_code == 200
    assert client.get("/auth/me", headers=bearer(old_token)).status_code == 401
    login = client.post("/auth/login", json={"email": email, "password": "correct-horse-1"})
    assert login.status_code == 400  # password no longer exists on the account


def test_unverified_or_missing_verification_is_rejected(client, idp):
    for flag in (False, None, "true"):
        info = claims()
        if flag is None:
            info.pop("email_verified")
        else:
            info["email_verified"] = flag
        idp(info)
        assert error_of(callback(client)) == "google_identity_unavailable"
        assert user_by_email(info["email"]) is None


def test_missing_subject_or_email_is_rejected(client, idp):
    for field in ("sub", "email"):
        info = claims()
        info.pop(field)
        idp(info)
        assert error_of(callback(client)) == "google_identity_unavailable"


@pytest.mark.parametrize("override", [
    {"iss": "https://evil.example.com"},
    {"aud": "someone-elses-client-id"},
    {"aud": ["someone-elses-client-id"]},
])
def test_wrong_issuer_or_audience_is_rejected(client, idp, override):
    info = claims(**override)
    idp(info)
    assert error_of(callback(client)) == "google_identity_unavailable"
    assert user_by_email(info["email"]) is None


def test_audience_list_containing_our_client_is_accepted(client, idp):
    idp(claims(aud=["other", settings.GOOGLE_CLIENT_ID]))
    token_of(callback(client))


@pytest.mark.parametrize("error", [
    Exception("token expired"),
    Exception("invalid signature"),
    Exception("access_denied: user cancelled"),
])
def test_failed_exchange_never_creates_a_session_or_user(client, idp, error):
    idp(error=error)
    assert error_of(callback(client)) == "google_oauth_failed"


def test_cancelled_login_from_google_redirects_with_error(client):
    # Google returns ?error=access_denied (no code/state). Real Authlib is used, so
    # this also proves a callback without session state is refused.
    response = client.get("/auth/google/callback?error=access_denied")
    assert error_of(response) == "google_oauth_failed"


def test_callback_without_session_state_is_rejected(client):
    response = client.get("/auth/google/callback?code=forged&state=forged")
    assert error_of(response) == "google_oauth_failed"


def test_deactivated_account_cannot_sign_in(client, idp):
    info = claims()
    idp(info)
    token_of(callback(client))

    async def deactivate(db):
        user = (await db.execute(select(User).where(User.email == info["email"]))).scalar_one()
        user.is_active = False
        await db.commit()

    db_run(deactivate)
    assert error_of(callback(client)) == "account_deactivated"


def test_redirect_target_is_fixed_and_ignores_request_parameters(client, idp):
    idp(claims())
    response = client.get(
        "/auth/google/callback?code=a&state=b&redirect=https://evil.example&next=//evil.example&redirect_uri=https://evil.example"
    )
    assert response.headers["location"].startswith(f"{FRONTEND}/auth/success#")


def test_login_redirect_uses_configured_callback_uri(client, monkeypatch):
    seen = {}

    async def fake_redirect(request, redirect_uri, **kw):
        seen["uri"] = redirect_uri
        from starlette.responses import RedirectResponse
        return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth")

    monkeypatch.setattr(auth_router.oauth.google, "authorize_redirect", fake_redirect)
    client.get("/auth/google?redirect_uri=https://evil.example")
    assert seen["uri"] == f"{settings.BACKEND_URL.rstrip('/')}/auth/google/callback"


def test_google_client_requests_pkce_s256():
    assert auth_router.oauth.google.client_kwargs["code_challenge_method"] == "S256"


def test_login_uses_backend_entry_matching_request_host(client, monkeypatch):
    monkeypatch.setattr(settings, "BACKEND_URL", "http://localhost:8000,http://backend.test")
    monkeypatch.setattr(settings, "FRONTEND_URL", "http://localhost:5173,http://frontend.test")
    seen = {}

    async def fake_redirect(request, redirect_uri, **kw):
        seen["uri"] = redirect_uri
        from starlette.responses import RedirectResponse
        return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth")

    monkeypatch.setattr(auth_router.oauth.google, "authorize_redirect", fake_redirect)
    client.get("/auth/google", headers={"Host": "backend.test"})
    assert seen["uri"] == "http://backend.test/auth/google/callback"
    client.get("/auth/google", headers={"Host": "localhost:8000"})
    assert seen["uri"] == "http://localhost:8000/auth/google/callback"
    assert "," not in seen["uri"]
