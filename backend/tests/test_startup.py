"""Startup and health behavior without relying on live integrations."""
import asyncio
import time

from fastapi.testclient import TestClient

from app import main
from app.config import settings


def test_application_import_and_startup(monkeypatch):
    async def no_db():
        return None

    async def no_neo4j():
        return None

    async def no_close():
        return None

    monkeypatch.setattr(main, "init_db", no_db)
    monkeypatch.setattr(main.neo4j_client, "connect", no_neo4j)
    monkeypatch.setattr(main.neo4j_client, "close", no_close)
    with TestClient(main.app) as client:
        assert main.app.title == "LectureMap API"
        assert client.get("/health").json()["status"] == "ok"


def test_postgres_failure_does_not_block_health_and_is_reported(monkeypatch):
    calls = 0

    async def db_failure():
        nonlocal calls
        calls += 1
        raise OSError("connection failed")

    async def neo_disabled():
        return None

    async def no_close():
        return None

    monkeypatch.setattr(main, "init_db", db_failure)
    monkeypatch.setattr(main.neo4j_client, "connect", neo_disabled)
    monkeypatch.setattr(main.neo4j_client, "close", no_close)
    monkeypatch.setattr(settings, "STARTUP_DEPENDENCY_RETRIES", 2)
    monkeypatch.setattr(settings, "STARTUP_RETRY_DELAY_SECONDS", 0)
    monkeypatch.setattr(settings, "NEO4J_URI", "")
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
        for _ in range(100):
            if calls == 2:
                break
            time.sleep(0.01)
        health = client.get("/health/dependencies").json()
        assert calls == 2
        assert health["dependencies"]["database"] == "unavailable"
        assert health["status"] == "degraded"


def test_neo4j_timeout_is_degraded_and_shutdown_is_graceful(monkeypatch):
    closed = False

    async def no_db():
        return None

    async def blocked_neo4j():
        await asyncio.sleep(30)

    async def no_close():
        nonlocal closed
        closed = True

    monkeypatch.setattr(main, "init_db", no_db)
    monkeypatch.setattr(main.neo4j_client, "connect", blocked_neo4j)
    monkeypatch.setattr(main.neo4j_client, "close", no_close)
    monkeypatch.setattr(settings, "NEO4J_CONNECTION_TIMEOUT", 0)
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
        for _ in range(200):
            if main.app.state.dependencies.get("neo4j") == "unavailable":
                break
            time.sleep(0.01)
        assert client.get("/health/dependencies").json()["dependencies"]["neo4j"] == "unavailable"
    assert closed


def test_redis_is_not_contacted_during_web_startup(monkeypatch):
    async def no_db():
        return None

    async def no_neo4j():
        return None

    async def no_close():
        return None

    monkeypatch.setattr(main, "init_db", no_db)
    monkeypatch.setattr(main.neo4j_client, "connect", no_neo4j)
    monkeypatch.setattr(main.neo4j_client, "close", no_close)
    monkeypatch.setattr(settings, "USE_CELERY", False)
    monkeypatch.setattr(settings, "REDIS_URL", "redis://unreachable.invalid:6379")
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
