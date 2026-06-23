import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Enum as SAEnum, Integer, Float
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class LectureStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    storage_path = Column(String, nullable=True)
    youtube_url = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    status = Column(SAEnum(LectureStatus), default=LectureStatus.PENDING, nullable=False)
    celery_task_id = Column(String, nullable=True)
    progress_step = Column(Integer, default=0, nullable=False)  # 0-5
    error_message = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    concept_count = Column(Integer, default=0, nullable=False)
    edge_count = Column(Integer, default=0, nullable=False)
    flashcard_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="lectures")
    flashcards = relationship("Flashcard", back_populates="lecture", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="lecture", cascade="all, delete-orphan")
