import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import user_settings
from app.services import concept_extraction as ce
from app.services.secret_box import decrypt_secret, encrypt_secret

FAKE = "AIza" + "x" * 35


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture()
def auth(client):
    r = client.post("/auth/signup", json={"email": f"{uuid.uuid4().hex}@example.com", "password": "correct-horse-9", "name": "K"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_secret_box_round_trip_and_not_plaintext():
    token = encrypt_secret(FAKE)
    assert FAKE not in token and decrypt_secret(token) == FAKE
    assert decrypt_secret("garbage") is None and decrypt_secret(None) is None


def test_save_status_delete_never_returns_key(client, auth, monkeypatch):
    monkeypatch.setattr(user_settings, "validate_gemini_key", lambda key: None)
    assert client.get("/settings/gemini-key", headers=auth).json() == {"configured": False, "last4": None}
    r = client.put("/settings/gemini-key", headers=auth, json={"api_key": FAKE})
    assert r.status_code == 200 and r.json() == {"configured": True, "last4": FAKE[-4:]}
    assert FAKE not in r.text and FAKE not in client.get("/settings/gemini-key", headers=auth).text
    r = client.delete("/settings/gemini-key", headers=auth)
    assert r.json()["configured"] is False


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
