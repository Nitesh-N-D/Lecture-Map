import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base


class StudySession(Base):
    __tablename__ = "study_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lecture_id = Column(String, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=True, index=True)
    cards_reviewed = Column(Integer, default=0, nullable=False)
    cards_correct = Column(Integer, default=0, nullable=False)
    total_time_seconds = Column(Integer, default=0, nullable=False)
    average_quality = Column(Float, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="study_sessions")
    lecture = relationship("Lecture", back_populates="study_sessions")
