import uuid
import logging
import os
import tempfile
from typing import List
from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.user import User
from app.models.lecture import Lecture, LectureStatus
from app.auth import get_current_user
from app.schemas.lecture import LectureResponse, LectureStatusResponse, UploadResponse
from app.config import settings
from app.services.storage import StorageError, delete_file, save_file
from app.tasks.pipeline import process_lecture, process_lecture_direct

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/lectures", tags=["lectures"])

PROGRESS_MAP = {0: 0, 1: 10, 2: 30, 3: 60, 4: 80, 5: 100}


def _queue_processing(lecture_id: str, background_tasks: BackgroundTasks) -> str:
    if not settings.USE_CELERY:
        # No Celery worker to consume the queue (e.g. Render free plan,
        # which only offers background workers on paid plans). Run the
        # pipeline in-process instead, so lectures don't sit PENDING
        # forever with an empty progress bar.
        task_id = f"bg-{uuid.uuid4()}"
        background_tasks.add_task(process_lecture_direct, lecture_id)
        return task_id
    try:
        inspector = process_lecture.app.control.inspect(timeout=1.0)
        if not inspector.ping():
            raise RuntimeError("No Celery worker responded to ping")
        task = process_lecture.delay(lecture_id)
        return task.id
    except Exception as e:
        task_id = f"local-{uuid.uuid4()}"
        logger.warning("Celery unavailable; using FastAPI background task %s: %s", task_id, type(e).__name__)
        background_tasks.add_task(process_lecture_direct, lecture_id)
        return task_id


# ── Upload file ───────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".mp3", ".mp4", ".wav", ".m4a", ".webm", ".ogg", ".pdf"}
# Browsers are inconsistent about audio/video MIME types, so we accept any
# audio/*, video/* type, plus the generic fallbacks, but reject clearly wrong
# declarations such as text/html or image/png.
GENERIC_MIME = {"application/octet-stream", "binary/octet-stream", ""}


def _safe_title(title: str | None, filename: str) -> str:
    base = (title or "").strip() or os.path.splitext(os.path.basename(filename))[0]
    base = "".join(ch for ch in base if ch.isprintable()).strip()
    return base[:200] or "Untitled lecture"


def _validate_upload(filename: str | None, content_type: str | None) -> str:
    if not filename:
        raise HTTPException(400, "A file name is required")
    suffix = os.path.splitext(os.path.basename(filename))[1].lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400, f"File type '{suffix or 'unknown'}' not supported. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in GENERIC_MIME:
        expected_pdf = suffix == ".pdf"
        ok = mime == "application/pdf" if expected_pdf else mime.startswith(("audio/", "video/")) or mime == "application/ogg"
        if not ok:
            raise HTTPException(415, f"Content type '{mime}' does not match a {suffix} file")
    return suffix


@router.post("/upload", response_model=UploadResponse)
async def upload_lecture(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    suffix = _validate_upload(file.filename, file.content_type)
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    lecture_id = str(uuid.uuid4())
    key = f"{current_user.id}/{lecture_id}{suffix}"
    content_type = file.content_type or "application/octet-stream"
    temp_upload_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_upload_path = tmp.name
            total_size = 0
            head = b""
            while chunk := await file.read(1024 * 1024):
                if not head:
                    head = chunk[:8]
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise HTTPException(413, f"File too large. Maximum size is {settings.MAX_UPLOAD_MB}MB.")
                tmp.write(chunk)

        if total_size == 0:
            raise HTTPException(400, "The uploaded file is empty")
        if suffix == ".pdf" and not head.startswith(b"%PDF"):
            raise HTTPException(400, "The uploaded file is not a valid PDF")

        try:
            storage_path = await run_in_threadpool(save_file, temp_upload_path, key, content_type)
        except StorageError as error:
            raise HTTPException(503, str(error))
    finally:
        if temp_upload_path:
            try:
                os.remove(temp_upload_path)
            except OSError:
                pass

    lecture = Lecture(
        id=lecture_id,
        user_id=current_user.id,
        title=_safe_title(title, file.filename),
        original_filename=os.path.basename(file.filename)[:255],
        storage_path=storage_path,
        status=LectureStatus.PENDING,
    )
    db.add(lecture)
    try:
        await db.commit()
    except Exception:
        # Never leave an unreferenced object behind in storage.
        await db.rollback()
        await run_in_threadpool(delete_file, storage_path)
        raise

    task_id = _queue_processing(lecture_id, background_tasks)
    lecture.celery_task_id = task_id
    await db.commit()

    return UploadResponse(
        lecture_id=lecture_id,
        task_id=task_id,
        message="Upload successful. Processing started.",
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


# ── Retry failed processing ───────────────────────────────────────────────────

@router.post("/{lecture_id}/retry", response_model=UploadResponse)
async def retry_lecture(
    lecture_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")
    if lecture.status != LectureStatus.FAILED:
        raise HTTPException(409, "Only failed lectures can be retried")
    if not lecture.storage_path:
        raise HTTPException(409, "The original upload is no longer available; please upload it again")

    lecture.status = LectureStatus.PENDING
    lecture.progress_step = 0
    lecture.error_message = None
    await db.commit()

    task_id = _queue_processing(lecture_id, background_tasks)
    lecture.celery_task_id = task_id
    await db.commit()
    return UploadResponse(lecture_id=lecture_id, task_id=task_id, message="Processing restarted.")


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

    storage_ref = lecture.storage_path
    await db.delete(lecture)
    await db.commit()
    await run_in_threadpool(delete_file, storage_ref)
    return {"message": "Lecture deleted"}
