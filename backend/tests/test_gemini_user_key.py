import uuid
import time
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User
from app.routers import user_settings
from app.services import concept_extraction as ce
from app.services.secret_box import decrypt_secret, encrypt_secret
from app.config import settings

FAKE = "AIza" + "x" * 35


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        deadline = time.monotonic() + 10
        while app.state.dependencies.get("database") != "available" and time.monotonic() < deadline:
            time.sleep(0.01)
        assert app.state.dependencies.get("database") == "available"
        yield c


@pytest.fixture()
def auth(client):
    r = client.post("/auth/signup", json={"email": f"{uuid.uuid4().hex}@example.com", "password": "correct-horse-9", "name": "K"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_secret_box_round_trip_and_not_plaintext():
    token = encrypt_secret(FAKE)
    assert FAKE not in token and decrypt_secret(token) == FAKE
    assert decrypt_secret("garbage") is None and decrypt_secret(None) is None


def test_encrypted_value_cannot_be_decrypted_after_authentication_failure():
    from app.services.secret_box import SecretDecryptionError, decrypt_user_secret
    with pytest.raises(SecretDecryptionError):
        decrypt_user_secret("not-a-valid-fernet-token")


def test_missing_encryption_secret_fails_safely(monkeypatch):
    monkeypatch.setattr(settings, "KEY_ENCRYPTION_SECRET", "")
    monkeypatch.setattr(settings, "JWT_SECRET", "")
    with pytest.raises(RuntimeError, match="stable KEY_ENCRYPTION_SECRET"):
        encrypt_secret(FAKE)


def test_save_status_delete_never_returns_key(client, auth, monkeypatch):
    monkeypatch.setattr(user_settings, "validate_gemini_key", lambda key: None)
    assert client.get("/settings/gemini-key", headers=auth).json() == {"configured": False, "last4": None}
    r = client.put("/settings/gemini-key", headers=auth, json={"api_key": FAKE})
    assert r.status_code == 200 and r.json() == {"configured": True, "last4": FAKE[-4:]}
    assert FAKE not in r.text and FAKE not in client.get("/settings/gemini-key", headers=auth).text
    r = client.delete("/settings/gemini-key", headers=auth)
    assert r.json()["configured"] is False


def test_database_contains_only_encrypted_personal_key(client, monkeypatch):
    monkeypatch.setattr(user_settings, "validate_gemini_key", lambda key: None)
    signup = client.post("/auth/signup", json={
        "email": f"{uuid.uuid4().hex}@example.com", "password": "correct-horse-9",
    }).json()
    key = "AIza" + "z" * 35
    headers = {"Authorization": f"Bearer {signup['access_token']}"}
    response = client.put("/settings/gemini-key", headers=headers, json={"api_key": key})
    assert response.status_code == 200 and key not in response.text

    async def stored_value():
        async with AsyncSessionLocal() as db:
            return (await db.get(User, signup["user"]["id"])).gemini_api_key_enc
    encrypted = asyncio.run(stored_value())
    assert encrypted and key not in encrypted and decrypt_secret(encrypted) == key


def test_users_only_see_their_own_key_status(client, monkeypatch):
    monkeypatch.setattr(user_settings, "validate_gemini_key", lambda key: None)
    users = []
    for suffix in ("left", "right"):
        signup = client.post("/auth/signup", json={
            "email": f"{uuid.uuid4().hex}@example.com", "password": "correct-horse-9",
        }).json()
        headers = {"Authorization": f"Bearer {signup['access_token']}"}
        key = "AIza" + ("l" if suffix == "left" else "r") * 35
        client.put("/settings/gemini-key", headers=headers, json={"api_key": key})
        users.append((headers, key))
    left = client.get("/settings/gemini-key", headers=users[0][0])
    right = client.get("/settings/gemini-key", headers=users[1][0])
    assert left.json()["last4"] == users[0][1][-4:]
    assert right.json()["last4"] == users[1][1][-4:]
    assert users[0][1] not in right.text and users[1][1] not in left.text


def test_candidate_key_test_is_authenticated_and_never_echoes_key(client, auth, monkeypatch):
    seen = []
    async def fake_test():
        seen.append(ce.active_gemini_key())
    monkeypatch.setattr(user_settings, "test_gemini_key", fake_test)
    response = client.post("/settings/gemini-key/test", headers=auth, json={"api_key": FAKE})
    assert response.status_code == 200 and response.json() == {"valid": True, "message": "Gemini API key is working."}
    assert FAKE not in response.text and seen == [FAKE]
    assert client.post("/settings/gemini-key/test", json={"api_key": FAKE}).status_code == 401


def test_key_test_failure_is_safe(client, auth, monkeypatch):
    async def fake_test():
        raise ce.GeminiRequestError("invalid_api_key", "Your Gemini API key is invalid. Update it in Settings.")
    monkeypatch.setattr(user_settings, "test_gemini_key", fake_test)
    response = client.post("/settings/gemini-key/test", headers=auth, json={"api_key": FAKE})
    assert response.status_code == 400 and FAKE not in response.text


def test_rejected_key_is_not_saved(client, auth, monkeypatch):
    def reject(key):
        raise RuntimeError("Google rejected this key. Check that you copied the whole key.")

    monkeypatch.setattr(user_settings, "validate_gemini_key", reject)
    r = client.put("/settings/gemini-key", headers=auth, json={"api_key": FAKE})
    assert r.status_code == 400 and "rejected" in r.json()["detail"]
    assert client.get("/settings/gemini-key", headers=auth).json()["configured"] is False


def test_requires_login_and_rejects_whitespace(client, auth):
    assert client.get("/settings/gemini-key").status_code == 401
    assert client.put("/settings/gemini-key", headers=auth, json={"api_key": "AIza has space inside the key"}).status_code == 400


def test_user_key_takes_precedence_and_messages_point_to_settings():
    assert ce.active_gemini_key() == ce.settings.GEMINI_API_KEY
    token = ce.user_gemini_key.set(FAKE)
    try:
        assert ce.active_gemini_key() == FAKE
        quota = type("ResourceExhausted", (Exception,), {})()
        assert "your Gemini key" in ce._gemini_failure_message(quota).lower() or "Your Gemini key" in ce._gemini_failure_message(quota)
    finally:
        ce.user_gemini_key.reset(token)
    assert "Add your own free Gemini key in Settings" in ce._gemini_failure_message(type("ResourceExhausted", (Exception,), {})())


def test_production_refuses_local_storage_fallback():
    from tests.test_config import run

    result = run("import app.config", ENVIRONMENT="production", FRONTEND_URL="https://app.example.com",
                 BACKEND_URL="https://api.example.com", ALLOW_LOCAL_STORAGE_FALLBACK="true")
    assert result.returncode != 0 and "ALLOW_LOCAL_STORAGE_FALLBACK" in result.stderr
