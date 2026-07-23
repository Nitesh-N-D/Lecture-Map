from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.lecture import LectureStatus


class LectureBase(BaseModel):
    title: Optional[str] = None


class LectureResponse(LectureBase):
    id: str
    user_id: str
    status: LectureStatus
    original_filename: Optional[str] = None
    progress_step: int
    concept_count: int
    edge_count: int
    flashcard_count: int
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LectureStatusResponse(BaseModel):
    lecture_id: str
    status: LectureStatus
    progress_step: int
    progress_percent: float
    celery_task_id: Optional[str] = None
    error_message: Optional[str] = None


class UploadResponse(BaseModel):
    lecture_id: str
    task_id: str
    message: str
