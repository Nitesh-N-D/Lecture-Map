"""Review history, streaks, progress summary and per-user isolation."""
import asyncio
from datetime import datetime, timedelta

from app.database import AsyncSessionLocal
from app.models.flashcard import Flashcard
from app.models.review_log import ReviewLog
from tests.test_api import GRAPH, client, db_run, make_lecture, no_pipeline, signup  # noqa: F401
from sqlalchemy import select, func


def _cards_for(lecture_id, concept_ids):
    async def go(db):
        for i, cid in enumerate(concept_ids):
            db.add(Flashcard(id=f"{lecture_id}-p{i}", lecture_id=lecture_id, concept_id=cid,
                             concept_name=cid, question=f"q{i}", answer="a",
                             next_review_at=datetime.utcnow() - timedelta(minutes=1)))
        await db.commit()
    db_run(go)
    return [f"{lecture_id}-p{i}" for i in range(len(concept_ids))]


def test_review_is_logged_and_feeds_stats_and_history(client):  # noqa: F811
    _, headers, user_id = signup(client)
    lecture_id = make_lecture(user_id, GRAPH)
    (card,) = _cards_for(lecture_id, ["x:a"])

    r = client.post(f"/review/{card}", headers=headers, json={"quality": 4})
    assert r.status_code == 200, r.text

    stats = client.get("/review/stats", headers=headers).json()
    assert stats["cards_reviewed_today"] == 1 and stats["streak_days"] == 1

    history = client.get("/review/history", headers=headers).json()
    today = datetime.utcnow().date().isoformat()
    assert history["days"] == {today: 1} and history["total_reviews"] == 1
    assert history["recent"][0]["card_id"] == card and history["recent"][0]["quality"] == 4


def test_streak_counts_consecutive_days_from_log(client):  # noqa: F811
    _, headers, user_id = signup(client)
    lecture_id = make_lecture(user_id, GRAPH)

    async def seed(db):
        now = datetime.utcnow()
        for days_ago in (1, 2, 3, 5):  # gap on day 4; nothing today yet
            db.add(ReviewLog(user_id=user_id, lecture_id=lecture_id, card_id="c", concept_id="x:a",
                             quality=4, interval_days=1, reviewed_at=now - timedelta(days=days_ago)))
        await db.commit()
    db_run(seed)
    assert client.get("/review/stats", headers=headers).json()["streak_days"] == 3


def test_progress_summary_uses_persisted_state(client):  # noqa: F811
    _, headers, user_id = signup(client)
    empty = client.get("/progress/summary", headers=headers).json()
    assert empty["total_concepts"] == 0 and empty["percent"] == 0 and empty["current_lecture_id"] is None

    lecture_id = make_lecture(user_id, GRAPH, visited=["x:a"])
    body = client.get("/progress/summary", headers=headers).json()
    assert body["total_concepts"] == 3
    assert body["completed_concepts"] == 1 and body["mastered_concepts"] == 0
    assert body["pending_concepts"] == 2 and body["blocked_concepts"] == 1  # x:c waits on x:b
    assert body["percent"] == 33 and body["current_lecture_id"] == lecture_id
    assert body["lectures"][0]["studied"] == 1


def test_mastery_counts_after_successful_reviews(client):  # noqa: F811
    _, headers, user_id = signup(client)
    lecture_id = make_lecture(user_id, GRAPH)
    (card,) = _cards_for(lecture_id, ["x:a"])

    async def master(db):
        row = (await db.execute(select(Flashcard).where(Flashcard.id == card))).scalar_one()
        row.repetitions = 5
        await db.commit()
    db_run(master)
    body = client.get("/progress/summary", headers=headers).json()
    assert body["mastered_concepts"] == 1


def test_users_cannot_see_each_others_progress_or_reviews(client):  # noqa: F811
    _, owner, owner_id = signup(client)
    _, intruder, _ = signup(client)
    lecture_id = make_lecture(owner_id, GRAPH, visited=["x:a"])
    (card,) = _cards_for(lecture_id, ["x:a"])
    client.post(f"/review/{card}", headers=owner, json={"quality": 5})

    assert client.post(f"/review/{card}", headers=intruder, json={"quality": 0}).status_code == 404
    assert client.get("/progress/summary", headers=intruder).json()["total_concepts"] == 0
    assert client.get("/review/history", headers=intruder).json()["total_reviews"] == 0
    assert client.get(f"/lectures/{lecture_id}/graph", headers=intruder).status_code == 404
    assert client.get(f"/lectures/{lecture_id}/flashcards", headers=intruder).status_code == 404
    assert client.post(f"/concepts/x:a/visit", headers=intruder,
                       params={"lecture_id": lecture_id}).status_code == 404


def test_account_deletion_removes_review_history(client):  # noqa: F811
    _, headers, user_id = signup(client, password="correct-horse-1")
    lecture_id = make_lecture(user_id, GRAPH)
    (card,) = _cards_for(lecture_id, ["x:a"])
    client.post(f"/review/{card}", headers=headers, json={"quality": 4})
    r = client.request("DELETE", "/auth/me", headers=headers,
                       json={"confirm": "DELETE", "password": "correct-horse-1"})
    assert r.status_code in (200, 204)

    async def count(db):
        return (await db.execute(select(func.count(ReviewLog.id)).where(ReviewLog.user_id == user_id))).scalar()
    assert db_run(count) == 0


def test_progress_requires_auth(client):  # noqa: F811
    assert client.get("/progress/summary").status_code == 401
    assert client.get("/review/history").status_code == 401
