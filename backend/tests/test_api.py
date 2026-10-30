import asyncio
import json
import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import AsyncSessionLocal
from app.models.flashcard import Flashcard
from app.models.lecture import Lecture, LectureStatus
from app.routers import lectures as lectures_router


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def no_pipeline(monkeypatch):
    calls = []
    monkeypatch.setattr(lectures_router, "process_lecture_direct", lambda lid: calls.append(lid))
    return calls


def signup(client, email=None, password="correct-horse-1"):
    email = email or f"{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/signup", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return email, {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]["id"]


def db_run(coro_fn):
    async def run():
        async with AsyncSessionLocal() as db:
            return await coro_fn(db)

    return asyncio.run(run())


def make_lecture(user_id, graph=None, visited=None, status=LectureStatus.COMPLETED, cards=0, storage_path=None):
    lecture_id = str(uuid.uuid4())

    async def go(db):
        db.add(Lecture(
            id=lecture_id, user_id=user_id, title="L", status=status, storage_path=storage_path,
            graph_data=json.dumps(graph) if graph else None,
            visited_concept_ids=json.dumps(visited or []),
        ))
        await db.flush()
        for i in range(cards):
            db.add(Flashcard(
                id=f"{lecture_id}-{i}", lecture_id=lecture_id, concept_id="c", concept_name="C",
                question="q", answer="a", next_review_at=datetime.utcnow() - timedelta(days=1),
            ))
        await db.commit()

    db_run(go)
    return lecture_id


GRAPH = {
    "concepts": [
        {"id": "x:a", "name": "Basics", "definition": "d", "difficulty": "beginner", "timestamp_seconds": 0},
        {"id": "x:b", "name": "Middle", "definition": "d", "difficulty": "intermediate", "timestamp_seconds": 5},
        {"id": "x:c", "name": "Advanced", "definition": "d", "difficulty": "advanced", "timestamp_seconds": 9},
    ],
    "edges": [{"from": "x:a", "to": "x:b", "strength": 0.9}, {"from": "x:b", "to": "x:c", "strength": 0.8}],
    "source": "gemini",
}


# ── auth ─────────────────────────────────────────────────────────────────────

def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_signup_login_and_case_insensitive_email(client):
    email, headers, _ = signup(client, "Mixed.Case@Example.com")
    assert client.get("/auth/me", headers=headers).json()["email"] == "mixed.case@example.com"
    ok = client.post("/auth/login", json={"email": "MIXED.case@example.com", "password": "correct-horse-1"})
    assert ok.status_code == 200
    bad = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert bad.status_code == 401


def test_signup_never_takes_over_existing_account(client):
    email, _, _ = signup(client)
    r = client.post("/auth/signup", json={"email": email.upper(), "password": "another-pass-9"})
    assert r.status_code == 409


def test_requires_auth(client):
    assert client.get("/lectures").status_code == 401
    assert client.get("/lectures", headers={"Authorization": "Bearer garbage"}).status_code == 401


# ── uploads ──────────────────────────────────────────────────────────────────

def upload(client, headers, name, data, ctype):
    return client.post("/lectures/upload", headers=headers, files={"file": (name, data, ctype)}, data={"title": "T"})


def test_upload_validation(client):
    _, headers, _ = signup(client)
    assert upload(client, headers, "notes.exe", b"abc", "application/octet-stream").status_code == 400
    assert upload(client, headers, "a.mp3", b"", "audio/mpeg").status_code == 400  # empty
    assert upload(client, headers, "a.mp3", b"abc", "text/html").status_code == 415  # wrong MIME
    assert upload(client, headers, "a.pdf", b"not a pdf", "application/pdf").status_code == 400  # bad magic bytes


def test_upload_accepts_valid_file_and_isolates_users(client, no_pipeline):
    _, headers, _ = signup(client)
    r = upload(client, headers, "../../evil name.pdf", b"%PDF-1.4 fake", "application/pdf")
    assert r.status_code == 200, r.text
    lecture_id = r.json()["lecture_id"]
    assert no_pipeline == [lecture_id]
    assert client.get(f"/lectures/{lecture_id}", headers=headers).status_code == 200

    _, other, _ = signup(client)
    assert client.get(f"/lectures/{lecture_id}", headers=other).status_code == 404
    assert client.delete(f"/lectures/{lecture_id}", headers=other).status_code == 404
    assert client.delete(f"/lectures/{lecture_id}", headers=headers).status_code == 200


def test_retry_only_for_failed(client, no_pipeline):
    _, headers, uid = signup(client)
    done = make_lecture(uid, GRAPH)
    assert client.post(f"/lectures/{done}/retry", headers=headers).status_code in (400, 409)
    no_upload = make_lecture(uid, None, status=LectureStatus.FAILED)  # original file gone
    assert client.post(f"/lectures/{no_upload}/retry", headers=headers).status_code == 409
    failed = make_lecture(uid, None, status=LectureStatus.FAILED, storage_path="local:u/f.pdf")
    assert client.post(f"/lectures/{failed}/retry", headers=headers).status_code == 200
    assert failed in no_pipeline
    assert client.get(f"/lectures/{failed}", headers=headers).json()["status"] == "PENDING"


# ── graph (snapshot, no Neo4j) ───────────────────────────────────────────────

def test_graph_study_path_gaps_and_visits(client):
    _, headers, uid = signup(client)
    lid = make_lecture(uid, GRAPH)

    g = client.get(f"/lectures/{lid}/graph", headers=headers).json()
    assert g["stats"]["total_nodes"] == 3 and len(g["edges"]) == 2

    sp = client.get(f"/lectures/{lid}/study-path", params={"target": "x:c"}, headers=headers).json()
    assert [n["concept_id"] for n in sp["path"]] == ["x:a", "x:b"]
    assert client.get(f"/lectures/{lid}/study-path", params={"target": "nope"}, headers=headers).status_code == 404

    assert client.get(f"/lectures/{lid}/graph/gaps", headers=headers).json()["total_gaps"] == 0
    assert client.post("/concepts/x:c/visit", params={"lecture_id": lid}, headers=headers).status_code == 200
    gaps = client.get(f"/lectures/{lid}/graph/gaps", headers=headers).json()
    assert [n["concept_id"] for n in gaps["gaps"]] == ["x:a", "x:b"]

    assert client.post("/concepts/ghost/visit", params={"lecture_id": lid}, headers=headers).status_code == 404
    assert client.delete("/concepts/x:c/visit", params={"lecture_id": lid}, headers=headers).status_code == 200
    assert client.get(f"/lectures/{lid}/graph/gaps", headers=headers).json()["total_gaps"] == 0


def test_graph_endpoints_are_owner_scoped(client):
    _, _, uid = signup(client)
    lid = make_lecture(uid, GRAPH)
    _, other, _ = signup(client)
    assert client.get(f"/lectures/{lid}/graph", headers=other).status_code == 404
    assert client.post("/concepts/x:a/visit", params={"lecture_id": lid}, headers=other).status_code == 404


def test_knowledge_map_bridges_same_named_concepts(client):
    _, headers, uid = signup(client)
    other_graph = {**GRAPH, "concepts": [{**GRAPH["concepts"][0], "id": "y:a"}], "edges": []}
    make_lecture(uid, GRAPH)
    make_lecture(uid, other_graph)
    km = client.get("/knowledge-map", headers=headers).json()
    assert km["lecture_count"] == 2 and len(km["nodes"]) == 4
    assert any(b["type"] == "same_concept" for b in km["bridges"])


# ── flashcards ───────────────────────────────────────────────────────────────

def test_review_applies_once_and_is_owner_scoped(client):
    _, headers, uid = signup(client)
    lid = make_lecture(uid, GRAPH, cards=1)
    card_id = f"{lid}-0"

    due = client.get("/review/due", headers=headers).json()
    assert [c["id"] for c in due] == [card_id]

    r = client.post(f"/review/{card_id}", json={"quality": 5}, headers=headers)
    assert r.status_code == 200 and r.json()["card"]["total_reviews"] == 1
    again = client.post(f"/review/{card_id}", json={"quality": 5}, headers=headers)
    assert again.status_code == 409  # double submit rejected
    assert client.get("/review/due", headers=headers).json() == []

    _, other, _ = signup(client)
    assert client.post(f"/review/{card_id}", json={"quality": 5}, headers=other).status_code == 404


# ── export ───────────────────────────────────────────────────────────────────

def test_export_headers_and_validity(client):
    _, headers, uid = signup(client)
    lid = make_lecture(uid, GRAPH, cards=2)

    async def retitle(db):
        lec = await db.get(Lecture, lid)
        lec.title = 'Bad "name"\r\nX-Evil: 1/é'
        await db.commit()

    db_run(retitle)

    pdf = client.get(f"/export/pdf/{lid}", headers=headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    disp = pdf.headers["content-disposition"]
    assert "\r" not in disp and "\n" not in disp and "x-evil" not in pdf.headers

    anki = client.get(f"/export/anki/{lid}", headers=headers)
    assert anki.status_code == 200 and anki.content[:2] == b"PK"

    empty = make_lecture(uid, GRAPH)
    assert client.get(f"/export/pdf/{empty}", headers=headers).status_code == 404


# ── progress model ───────────────────────────────────────────────────────────

def statuses(client, headers, lid):
    return {n["concept_id"]: n["status"] for n in client.get(f"/lectures/{lid}/graph", headers=headers).json()["nodes"]}


def test_viewing_never_grants_progress_and_mastery_needs_reviews(client):
    _, headers, uid = signup(client)
    lid = make_lecture(uid, GRAPH)

    # Reading the graph, a concept, and the study path must not change anything.
    client.get(f"/concepts/x:a", params={"lecture_id": lid}, headers=headers)
    client.get(f"/lectures/{lid}/study-path", params={"target": "x:c"}, headers=headers)
    assert statuses(client, headers, lid) == {"x:a": "unexplored", "x:b": "blocked", "x:c": "blocked"}

    # Explicit studied action unlocks the dependent concept.
    client.post("/concepts/x:a/visit", params={"lecture_id": lid}, headers=headers)
    assert statuses(client, headers, lid) == {"x:a": "studied", "x:b": "unexplored", "x:c": "blocked"}
    sp = client.get(f"/lectures/{lid}/study-path", params={"target": "x:c"}, headers=headers).json()
    assert sp["next_concept"]["concept_id"] == "x:b" and sp["remaining_steps"] == 1

    # Mastery only comes from reviews: one success is not enough, two are.
    async def add_card(db):
        db.add(Flashcard(id=f"{lid}-m", lecture_id=lid, concept_id="x:b", concept_name="Middle", question="q",
                         answer="a", repetitions=0, next_review_at=datetime.utcnow()))
        await db.commit()
    db_run(add_card)
    assert statuses(client, headers, lid)["x:b"] == "unexplored"

    async def set_reps(db):
        card = await db.get(Flashcard, f"{lid}-m")
        card.repetitions = 1
        await db.commit()
    db_run(set_reps)
    assert statuses(client, headers, lid)["x:b"] == "unexplored"

    async def set_reps2(db):
        card = await db.get(Flashcard, f"{lid}-m")
        card.repetitions = 2
        await db.commit()
    db_run(set_reps2)
    st = statuses(client, headers, lid)
    assert st["x:b"] == "mastered" and st["x:c"] == "unexplored"


# ── sessions and privacy ─────────────────────────────────────────────────────

def test_logout_revokes_existing_tokens(client):
    email, headers, _ = signup(client)
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert client.post("/auth/logout", headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    # logging in again issues a token valid for the new version
    r = client.post("/auth/login", json={"email": email, "password": "correct-horse-1"})
    fresh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200


def test_data_export_contains_only_own_data(client):
    _, headers, uid = signup(client)
    lid = make_lecture(uid, GRAPH, cards=2)
    _, other_headers, other_uid = signup(client)
    other_lid = make_lecture(other_uid, GRAPH, cards=1)

    data = client.get("/auth/me/export", headers=headers).json()
    assert [l["id"] for l in data["lectures"]] == [lid]
    assert len(data["flashcards"]) == 2 and all(c["lecture_id"] == lid for c in data["flashcards"])
    assert "hashed_password" not in json.dumps(data) and other_lid not in json.dumps(data)


def test_account_deletion_removes_everything_and_spares_others(client):
    email, headers, uid = signup(client)
    upload_resp = upload(client, headers, "notes.pdf", b"%PDF-1.4 fake", "application/pdf")
    lid = upload_resp.json()["lecture_id"]
    make_lecture(uid, GRAPH, cards=2)
    _, other_headers, other_uid = signup(client)
    other_lid = make_lecture(other_uid, GRAPH, cards=1)

    from app.config import settings
    from pathlib import Path
    stored = list(Path(settings.UPLOAD_DIR).glob(f"{uid}/*"))
    assert stored, "uploaded file should exist before deletion"

    assert client.request("DELETE", "/auth/me", headers=headers, json={"confirm": "nope", "password": "correct-horse-1"}).status_code == 400
    assert client.request("DELETE", "/auth/me", headers=headers, json={"confirm": "DELETE", "password": "wrong"}).status_code == 403
    assert client.request("DELETE", "/auth/me", headers=headers, json={"confirm": "DELETE", "password": "correct-horse-1"}).status_code == 200

    assert client.get("/auth/me", headers=headers).status_code == 401           # sessions gone
    assert client.post("/auth/login", json={"email": email, "password": "correct-horse-1"}).status_code == 401
    assert not list(Path(settings.UPLOAD_DIR).glob(f"{uid}/*"))                 # files gone

    async def counts(db):
        from sqlalchemy import select, func
        lectures = (await db.execute(select(func.count()).select_from(Lecture).where(Lecture.user_id == uid))).scalar()
        cards = (await db.execute(select(func.count()).select_from(Flashcard).where(Flashcard.lecture_id.in_([lid])))).scalar()
        return lectures, cards
    assert db_run(counts) == (0, 0)
    assert client.get(f"/lectures/{other_lid}", headers=other_headers).status_code == 200  # others untouched
