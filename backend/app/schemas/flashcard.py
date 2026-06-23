from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class FlashcardBase(BaseModel):
    question: str
    answer: str
    concept_id: str
    concept_name: str


class FlashcardCreate(FlashcardBase):
    lecture_id: str


class FlashcardResponse(FlashcardBase):
    id: str
    lecture_id: str
    easiness_factor: float
    interval_days: int
    repetitions: int
    next_review_at: datetime
    last_reviewed_at: Optional[datetime] = None
    total_reviews: int
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5, description="SM-2 quality rating 0-5")


class ReviewResponse(BaseModel):
    card: FlashcardResponse
    next_review_at: datetime
    interval_days: int


class ReviewStats(BaseModel):
    cards_reviewed_today: int
    cards_due_today: int
    streak_days: int
    upcoming_due: dict  # {date_str: count}
    total_cards: int
