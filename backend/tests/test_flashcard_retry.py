import asyncio
import hashlib
import json
import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.database import AsyncSessionLocal
from app.main import app
from app.models.lecture import Lecture, LectureStatus
from app.models.user import User
from app.routers import lectures as lectures_router
from app.services.concept_extraction import GeminiRequestError
from app.services.secret_box import encrypt_secret
from app.tasks import pipeline


@pytest.fixture(scope="module")
def client():
    with TestClient(app, raise_server_exceptions=False) as c:
        deadline = time.monotonic() + 10
        while app.state.dependencies.get("database") != "available" and time.monotonic() < deadline:
            time.sleep(0.01)
        assert app.state.dependencies.get("database") == "available"
        yield c


def signup(client):
    response = client.post("/auth/signup", json={
        "email": f"{uuid.uuid4().hex}@example.com", "password": "correct-horse-91",
    })
    assert response.status_code == 200, response.text
    return response.json()["user"]["id"], {"Authorization": f"Bearer {response.json()['access_token']}"}


def make_failed_lecture(user_id, *, error="[GEMINI:quota_exhausted] Quota reached.", key_digest=None):
    lecture_id = str(uuid.uuid4())
    graph = {"concepts": [
        {"id": "concept-a", "name": "A", "definition": "Definition A"},
        {"id": "concept-b", "name": "B", "definition": "Definition B"},
        {"id": "concept-c", "name": "C", "definition": "Definition C"},
    ], "edges": []}

    async def create():
        async with AsyncSessionLocal() as db:
            db.add(Lecture(
                id=lecture_id, user_id=user_id, status=LectureStatus.FAILED,
                progress_step=5, transcript="Persisted lecture transcript",
                graph_data=json.dumps(graph), error_message=error,
                failure_key_digest=key_digest,
            ))
            await db.commit()
    asyncio.run(create())
    return lecture_id, graph["concepts"]


def test_retry_endpoint_is_owned_atomic_and_keeps_liveness(client, monkeypatch):
    owner, owner_auth = signup(client)
    other, other_auth = signup(client)
    lecture_id, _ = make_failed_lecture(owner)
    queued = []
    monkeypatch.setattr(lectures_router, "_queue_flashcard_retry", lambda lecture, _bg: queued.append(lecture) or "job-test")

    assert client.post(f"/lectures/{lecture_id}/retry-flashcards", headers=other_auth).status_code == 404
    response = client.post(f"/lectures/{lecture_id}/retry-flashcards", headers=owner_auth)
    assert response.status_code == 200 and queued == [lecture_id]
    assert client.post(f"/lectures/{lecture_id}/retry-flashcards", headers=owner_auth).status_code == 409
    status = client.get(f"/lectures/{lecture_id}/status", headers=owner_auth).json()
    assert status["status"] == "PENDING" and status["progress_percent"] == 95
    assert status["flashcards_remaining"] == 3


def test_invalid_key_retry_requires_configuration_change(client, monkeypatch):
    user_id, auth = signup(client)
    bad_key = "AIza" + "a" * 35
    new_key = "AIza" + "b" * 35
    digest = hashlib.sha256(bad_key.encode()).hexdigest()
    async def set_bad_key():
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            user.gemini_api_key_enc = encrypt_secret(bad_key)
            await db.commit()
    asyncio.run(set_bad_key())
    lecture_id, _ = make_failed_lecture(
        user_id, error="[GEMINI:invalid_api_key] Rejected.", key_digest=digest,
    )
    monkeypatch.setattr(lectures_router, "_queue_flashcard_retry", lambda *_: "job-test")
    same_key = client.post(f"/lectures/{lecture_id}/retry-flashcards", headers=auth)
    assert same_key.status_code == 409 and "Update" in same_key.json()["detail"]

    async def update_key():
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            user.gemini_api_key_enc = encrypt_secret(new_key)
            await db.commit()
    asyncio.run(update_key())
    changed_key = client.post(f"/lectures/{lecture_id}/retry-flashcards", headers=auth)
    assert changed_key.status_code == 200


def test_partial_flashcards_persist_and_resume_without_duplicates(client, monkeypatch):
    user_id, _ = signup(client)
    lecture_id, concepts = make_failed_lecture(user_id)
    key = "AIza" + "c" * 35
    engine, Session = pipeline._session_factory()
    db = Session()
    try:
        owner = db.query(User).filter(User.id == user_id).first()
        owner.gemini_api_key_enc = encrypt_secret(key)
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        lecture.status = LectureStatus.PROCESSING
        db.commit()
    finally:
        db.close()
        engine.dispose()

    calls = []
    fail_b_once = True
    async def fake_generate(*, concept_name, definition, context):
        nonlocal fail_b_once
        calls.append(concept_name)
        from app.services.concept_extraction import active_gemini_key
        assert active_gemini_key() == key
        if concept_name == "B" and fail_b_once:
            fail_b_once = False
            raise GeminiRequestError("quota_exhausted", "Quota exhausted.", key_fingerprint=hashlib.sha256(key.encode()).hexdigest())
        return [{"question": f"Question {concept_name}", "answer": definition}]
    monkeypatch.setattr("app.services.concept_extraction.generate_flashcards_for_concept", fake_generate)

    engine, Session = pipeline._session_factory()
    db = Session()
    try:
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        pipeline._generate_missing_cards(db, lecture, concepts, lecture.transcript)
        assert lecture.status == LectureStatus.FAILED and lecture.flashcard_count == 1
        assert {card.concept_id for card in lecture.flashcards} == {"concept-a"}
        lecture.status = LectureStatus.PENDING
        db.commit()
    finally:
        db.close()
        engine.dispose()

    pipeline._process_lecture_impl(lecture_id, flashcards_only=True)
    engine, Session = pipeline._session_factory()
    db = Session()
    try:
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        assert lecture.status == LectureStatus.COMPLETED and lecture.flashcard_count == 3
        assert len(lecture.flashcards) == 3
        assert sorted(calls) == ["A", "B", "B", "C"]
    finally:
        db.close()
        engine.dispose()
