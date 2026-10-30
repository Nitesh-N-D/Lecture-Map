import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app import middleware


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_security_headers_and_request_id(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-request-id"]


def test_request_id_is_echoed_only_when_safe(client):
    good = uuid.uuid4().hex
    assert client.get("/health", headers={"X-Request-ID": good}).headers["x-request-id"] == good
    bad = client.get("/health", headers={"X-Request-ID": "x\r\ny"}).headers["x-request-id"]
    assert bad != "x\r\ny" and len(bad) == 32


def test_auth_responses_are_not_cacheable(client):
    assert client.post("/auth/guest").headers["cache-control"] == "no-store"


def test_oversized_json_body_is_rejected_before_parsing(client):
    r = client.post("/auth/login", content=b"x" * (middleware.JSON_BODY_LIMIT + 1),
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["request_id"]


def test_rate_limit_blocks_then_reports_retry_after(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    middleware.limiter.hits.clear()
    codes = [client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"}).status_code
             for _ in range(12)]
    assert codes[:10] == [401] * 10
    assert codes[10:] == [429, 429]
    blocked = client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert int(blocked.headers["retry-after"]) >= 1
    middleware.limiter.hits.clear()


def test_rate_limit_is_per_client_and_per_bucket(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    middleware.limiter.hits.clear()
    for _ in range(10):
        client.post("/auth/login", json={"email": "a@example.com", "password": "wrong-password"})
    assert client.post("/auth/guest").status_code == 200  # different bucket
    middleware.limiter.hits.clear()


def test_forwarded_header_ignored_unless_proxy_trusted(monkeypatch):
    class Req:
        headers = {"x-forwarded-for": "9.9.9.9, 1.1.1.1"}
        client = type("C", (), {"host": "10.0.0.1"})()

    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", False)
    assert middleware.client_ip(Req) == "10.0.0.1"
    monkeypatch.setattr(settings, "TRUST_PROXY_HEADERS", True)
    assert middleware.client_ip(Req) == "9.9.9.9"


def test_unhandled_error_is_generic_and_carries_request_id(client):
    @app.get("/__boom")
    async def boom():
        raise RuntimeError("secret internal detail")

    r = client.get("/__boom")
    assert r.status_code == 500
    assert "secret" not in r.text and r.json()["request_id"] == r.headers["x-request-id"]
