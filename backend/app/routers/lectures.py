import uuid
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.user import User
from app.models.lecture import Lecture, LectureStatus
from app.auth import get_current_user
from app.schemas.lecture import LectureResponse, LectureStatusResponse, UploadResponse
from app.config import settings
from app.tasks.pipeline import process_lecture
from app.services.transcription import is_youtube_url

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lectures", tags=["lectures"])

PROGRESS_MAP = {0: 0, 1: 10, 2: 30, 3: 60, 4: 80, 5: 100}


# ── Upload file ───────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_lecture(
    file: UploadFile = File(...),
    title: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = {".mp3", ".mp4", ".wav", ".m4a", ".webm", ".ogg"}
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in allowed:
        raise HTTPException(400, f"File type '{suffix}' not supported. Allowed: {', '.join(allowed)}")

    lecture_id = str(uuid.uuid4())
    storage_path = f"{current_user.id}/{lecture_id}{suffix}"

    # Read file content once
    content = await file.read()

    # Upload to Supabase Storage
    try:
        from supabase import create_client
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type or "audio/mpeg"},
        )
    except Exception as e:
        logger.error(f"Supabase upload failed: {e}")
        # Store locally as fallback if Supabase not configured
        import os
        tmppath = f"/tmp/{lecture_id}{suffix}"
        with open(tmppath, "wb") as f_out:
            f_out.write(content)
        storage_path = tmppath

    lecture = Lecture(
        id=lecture_id,
        user_id=current_user.id,
        title=title or file.filename,
        original_filename=file.filename,
        storage_path=storage_path,
        status=LectureStatus.PENDING,
    )
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)

    task = process_lecture.delay(lecture_id)
    lecture.celery_task_id = task.id
    await db.commit()

    return UploadResponse(
        lecture_id=lecture_id,
        task_id=task.id,
        message="Upload successful. Processing started.",
    )


# ── YouTube URL ───────────────────────────────────────────────────────────────

@router.post("/youtube", response_model=UploadResponse)
async def add_youtube_lecture(
    url: str,
    title: str = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_youtube_url(url):
        raise HTTPException(400, "Invalid YouTube URL")

    lecture_id = str(uuid.uuid4())
    lecture = Lecture(
        id=lecture_id,
        user_id=current_user.id,
        title=title or f"YouTube: {url[:50]}",
        youtube_url=url,
        status=LectureStatus.PENDING,
    )
    db.add(lecture)
    await db.commit()
    await db.refresh(lecture)

    task = process_lecture.delay(lecture_id)
    lecture.celery_task_id = task.id
    await db.commit()

    return UploadResponse(
        lecture_id=lecture_id,
        task_id=task.id,
        message="YouTube lecture queued for processing.",
    )


# ── List lectures ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[LectureResponse])
async def list_lectures(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture)
        .where(Lecture.user_id == current_user.id)
        .order_by(desc(Lecture.created_at))
    )
    return [LectureResponse.model_validate(l) for l in result.scalars().all()]


# ── Get lecture ───────────────────────────────────────────────────────────────

@router.get("/{lecture_id}", response_model=LectureResponse)
async def get_lecture(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")
    return LectureResponse.model_validate(lecture)


# ── Status polling ────────────────────────────────────────────────────────────

@router.get("/{lecture_id}/status", response_model=LectureStatusResponse)
async def get_lecture_status(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    progress = PROGRESS_MAP.get(lecture.progress_step, 0)
    return LectureStatusResponse(
        lecture_id=lecture_id,
        status=lecture.status,
        progress_step=lecture.progress_step,
        progress_percent=float(progress),
        celery_task_id=lecture.celery_task_id,
        error_message=lecture.error_message,
    )


# ── Delete lecture ────────────────────────────────────────────────────────────

@router.delete("/{lecture_id}")
async def delete_lecture(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    # Delete from Neo4j
    try:
        from app.neo4j_client import neo4j_client
        await neo4j_client.delete_lecture_graph(lecture_id)
    except Exception as e:
        logger.error(f"Neo4j delete failed: {e}")

    await db.delete(lecture)
    await db.commit()
    return {"message": "Lecture deleted"}
