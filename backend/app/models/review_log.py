import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class ReviewLog(Base):
    """One row per flashcard review: the source of review history, streaks and activity.

    ``card_id`` is deliberately not a foreign key: regenerating a lecture's cards
    replaces them, and the learner's past activity should survive that.
    """

    __tablename__ = "review_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lecture_id = Column(String, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(String, nullable=False, index=True)
    concept_id = Column(String, nullable=False)
    quality = Column(Integer, nullable=False)
    interval_days = Column(Integer, nullable=False)
    reviewed_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = relationship("User", back_populates="review_logs")
    lecture = relationship("Lecture", back_populates="review_logs")
