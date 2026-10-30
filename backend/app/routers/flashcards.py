import logging
from datetime import datetime, date, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, update

from app.database import get_db
from app.models.user import User
from app.models.flashcard import Flashcard
from app.models.lecture import Lecture
from app.auth import get_current_user
from app.schemas.flashcard import FlashcardResponse, ReviewRequest, ReviewResponse, ReviewStats
from app.services.srs_service import sm2_update

logger = logging.getLogger(__name__)
def _utc_today() -> date:
    """Review timestamps are stored as naive UTC, so day boundaries are UTC days."""
    return datetime.utcnow().date()


router = APIRouter(tags=["flashcards"])

# Rejects accidental double submissions (double click / key repeat).
MIN_REVIEW_GAP_SECONDS = 2


@router.get("/lectures/{lecture_id}/flashcards", response_model=List[FlashcardResponse])
async def get_flashcards(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Lecture not found")

    result = await db.execute(
        select(Flashcard).where(Flashcard.lecture_id == lecture_id)
    )
    return [FlashcardResponse.model_validate(c) for c in result.scalars().all()]


@router.get("/review/due", response_model=List[FlashcardResponse])
async def get_due_cards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get flashcards due for review today (across all lectures)."""
    now = datetime.utcnow()

    # Get all lecture IDs for this user
    lectures_result = await db.execute(
        select(Lecture.id).where(Lecture.user_id == current_user.id)
    )
    lecture_ids = [row[0] for row in lectures_result.all()]

    if not lecture_ids:
        return []

    result = await db.execute(
        select(Flashcard)
        .where(
            and_(
                Flashcard.lecture_id.in_(lecture_ids),
                Flashcard.next_review_at <= now,
            )
        )
        .order_by(Flashcard.next_review_at)
    )
    return [FlashcardResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/review/{card_id}", response_model=ReviewResponse)
async def review_card(
    card_id: str,
    body: ReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ownership is enforced in the query itself; foreign cards look like missing cards.
    result = await db.execute(
        select(Flashcard)
        .join(Lecture, Lecture.id == Flashcard.lecture_id)
        .where(Flashcard.id == card_id, Lecture.user_id == current_user.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Flashcard not found")

    now = datetime.utcnow()
    if card.last_reviewed_at and (now - card.last_reviewed_at).total_seconds() < MIN_REVIEW_GAP_SECONDS:
        raise HTTPException(409, "This card was just reviewed")

    updates = sm2_update(card, body.quality)
    # Optimistic lock: only apply if nobody reviewed the card since we read it.
    rows = await db.execute(
        update(Flashcard)
        .where(Flashcard.id == card_id, Flashcard.total_reviews == card.total_reviews)
        .values(**updates)
    )
    if rows.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "This card was just reviewed")
    await db.commit()
    await db.refresh(card)

    return ReviewResponse(
        card=FlashcardResponse.model_validate(card),
        next_review_at=card.next_review_at,
        interval_days=card.interval_days,
    )


@router.get("/review/stats", response_model=ReviewStats)
async def get_review_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    today_start = datetime.combine(_utc_today(), datetime.min.time())

    # Get all lecture IDs
    lectures_result = await db.execute(
        select(Lecture.id).where(Lecture.user_id == current_user.id)
    )
    lecture_ids = [row[0] for row in lectures_result.all()]

    if not lecture_ids:
        return ReviewStats(
            cards_reviewed_today=0, cards_due_today=0, streak_days=0,
            upcoming_due={}, total_cards=0
        )

    # Cards reviewed today
    reviewed_today = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.lecture_id.in_(lecture_ids),
                Flashcard.last_reviewed_at >= today_start,
            )
        )
    )
    reviewed_count = reviewed_today.scalar() or 0

    # Cards due now
    due_now = await db.execute(
        select(func.count(Flashcard.id)).where(
            and_(
                Flashcard.lecture_id.in_(lecture_ids),
                Flashcard.next_review_at <= now,
            )
        )
    )
    due_count = due_now.scalar() or 0

    # Total cards
    total_result = await db.execute(
        select(func.count(Flashcard.id)).where(Flashcard.lecture_id.in_(lecture_ids))
    )
    total = total_result.scalar() or 0

    # Upcoming due (next 7 days)
    upcoming = {}
    for i in range(1, 8):
        day = _utc_today() + timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day + timedelta(days=1), datetime.min.time())
        count_result = await db.execute(
            select(func.count(Flashcard.id)).where(
                and_(
                    Flashcard.lecture_id.in_(lecture_ids),
                    Flashcard.next_review_at >= day_start,
                    Flashcard.next_review_at < day_end,
                )
            )
        )
        upcoming[day.isoformat()] = count_result.scalar() or 0

    # Streak: count consecutive calendar days (ending today or yesterday)
    # that had at least one card reviewed.
    streak_days = await _compute_streak(db, lecture_ids)

    return ReviewStats(
        cards_reviewed_today=reviewed_count,
        cards_due_today=due_count,
        streak_days=streak_days,
        upcoming_due=upcoming,
        total_cards=total,
    )


async def _compute_streak(db: AsyncSession, lecture_ids: list) -> int:
    """
    Count consecutive days (walking backward from today) where at least
    one flashcard was reviewed. Streak breaks the first day with zero
    reviews, unless that day is today (still in progress).
    """
    if not lecture_ids:
        return 0

    # Pull distinct review dates in descending order, capped at a
    # reasonable lookback window to keep the query cheap.
    lookback_start = datetime.combine(_utc_today() - timedelta(days=365), datetime.min.time())
    result = await db.execute(
        select(func.date(Flashcard.last_reviewed_at).label("review_date"))
        .where(
            and_(
                Flashcard.lecture_id.in_(lecture_ids),
                Flashcard.last_reviewed_at.isnot(None),
                Flashcard.last_reviewed_at >= lookback_start,
            )
        )
        .distinct()
        .order_by(func.date(Flashcard.last_reviewed_at).desc())
    )
    review_dates = set()
    for row in result.all():
        d = row[0]
        # SQLite/Postgres may return str or date depending on driver
        if isinstance(d, str):
            d = datetime.strptime(d, "%Y-%m-%d").date()
        review_dates.add(d)

    if not review_dates:
        return 0

    today = _utc_today()
    streak = 0
    cursor = today

    # If nothing reviewed today yet, start counting from yesterday
    # so an active streak isn't reset to 0 before the day is over.
    if cursor not in review_dates:
        cursor -= timedelta(days=1)

    while cursor in review_dates:
        streak += 1
        cursor -= timedelta(days=1)

    return streak
