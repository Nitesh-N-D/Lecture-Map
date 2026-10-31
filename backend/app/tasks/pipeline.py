import asyncio
import json
import logging
import os
import tempfile
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import app.models  # noqa: F401  (registers all tables)
from app.celery_app import celery_app

logger = logging.getLogger(__name__)

STEP_DOWNLOAD = 1
STEP_TRANSCRIBE = 2
STEP_EXTRACT = 3
STEP_GRAPH = 4
STEP_FLASHCARDS = 5

# Failures that retrying cannot fix (bad input, missing file, config problems).
NON_RETRYABLE = (ValueError, FileNotFoundError, PermissionError)


def _run_async(coro):
    """Run an async coroutine from sync worker code on a private event loop."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _sync_database_url(database_url: str) -> str:
    sync_url = (
        database_url
        .replace("postgresql+asyncpg://", "postgresql://", 1)
        .replace("sqlite+aiosqlite://", "sqlite://", 1)
    )
    if sync_url.startswith("postgresql://"):
        parts = urlsplit(sync_url)
        query = dict(parse_qsl(parts.query, keep_blank_values=True))
        if query.get("ssl") == "require" and "sslmode" not in query:
            query["sslmode"] = "require"
            query.pop("ssl", None)
            sync_url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return sync_url


def _session_factory():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    connect_args = {}
    if not settings.DATABASE_URL.startswith("sqlite"):
        connect_args["connect_timeout"] = max(1, int(settings.DB_CONNECT_TIMEOUT_SECONDS))
    engine = create_engine(
        _sync_database_url(settings.DATABASE_URL), pool_pre_ping=True,
        connect_args=connect_args,
    )
    return engine, sessionmaker(bind=engine)


def _public_error(error: Exception) -> str:
    """Return only reviewed safe error text; SDK messages can contain credentials."""
    from app.services.concept_extraction import GeminiRequestError

    if isinstance(error, GeminiRequestError):
        return f"[GEMINI:{error.code}] {error}"
    return f"Processing failed ({type(error).__name__}). You can retry this lecture."


def _mark_lecture_failed(lecture_id: str, error: Exception) -> bool:
    try:
        from app.models.lecture import Lecture, LectureStatus

        engine, Session = _session_factory()
        db = Session()
        try:
            lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
            if not lecture:
                return False
            lecture.status = LectureStatus.FAILED
            lecture.error_message = _public_error(error)
            lecture.failure_key_digest = getattr(error, "key_fingerprint", None)
            if lecture.transcript and lecture.graph_data:
                lecture.progress_step = STEP_FLASHCARDS
            db.commit()
            return True
        finally:
            db.close()
            engine.dispose()
    except Exception:
        logger.exception("Could not mark lecture %s as FAILED", lecture_id)
        return False


def recover_interrupted_lectures(max_age_minutes: int = 60, all_in_flight: bool = False) -> int:
    """Fail lectures whose processing was interrupted (worker crash / restart).

    ``all_in_flight`` is used at API start-up in BackgroundTasks mode, where any
    PENDING/PROCESSING lecture belongs to a task that died with the old process.
    """
    from app.models.lecture import Lecture, LectureStatus

    engine, Session = _session_factory()
    db = Session()
    try:
        query = db.query(Lecture).filter(Lecture.status.in_([LectureStatus.PENDING, LectureStatus.PROCESSING]))
        if not all_in_flight:
            query = query.filter(Lecture.updated_at < datetime.utcnow() - timedelta(minutes=max_age_minutes))
        count = 0
        for lecture in query.all():
            lecture.status = LectureStatus.FAILED
            lecture.error_message = "Processing was interrupted. Use Retry to process this lecture again."
            count += 1
        db.commit()
        return count
    finally:
        db.close()
        engine.dispose()


@celery_app.task(bind=True, max_retries=2, name="tasks.process_lecture")
def process_lecture(self, lecture_id: str):
    """Celery entrypoint. Retries only transient failures."""
    from app.services.concept_extraction import GeminiRequestError
    try:
        _process_lecture_impl(lecture_id)
    except GeminiRequestError as error:
        _mark_lecture_failed(lecture_id, error)
    except NON_RETRYABLE as error:
        _mark_lecture_failed(lecture_id, error)
    except Exception as error:
        if self.request.retries < self.max_retries:
            _reset_for_retry(lecture_id, error)
            raise self.retry(exc=error, countdown=30)
        _mark_lecture_failed(lecture_id, error)
        raise


def process_lecture_direct(lecture_id: str):
    """Entry point for FastAPI BackgroundTasks (no Celery worker)."""
    try:
        _process_lecture_impl(lecture_id)
    except Exception as error:
        _mark_lecture_failed(lecture_id, error)
        logger.error("Direct lecture processing failed for %s (%s)", lecture_id, type(error).__name__)


@celery_app.task(name="tasks.process_flashcards")
def process_flashcards(lecture_id: str):
    process_flashcards_direct(lecture_id)


def process_flashcards_direct(lecture_id: str):
    """Resume persisted concepts and only generate missing flashcard batches."""
    try:
        _process_lecture_impl(lecture_id, flashcards_only=True)
    except Exception as error:
        _mark_lecture_failed(lecture_id, error)
        logger.error("Flashcard retry failed for %s (%s)", lecture_id, type(error).__name__)


def _reset_for_retry(lecture_id: str, error: Exception):
    from app.models.lecture import Lecture, LectureStatus

    engine, Session = _session_factory()
    db = Session()
    try:
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        if lecture:
            lecture.status = LectureStatus.PENDING
            lecture.error_message = f"Temporary error, retrying: {_public_error(error)}"
            db.commit()
    finally:
        db.close()
        engine.dispose()


def _claim(db, lecture_id: str, *, flashcards_only: bool = False) -> bool:
    """Atomically move PENDING/FAILED -> PROCESSING. False if already claimed/done."""
    from app.models.lecture import Lecture, LectureStatus

    claimed = (
        db.query(Lecture)
        .filter(
            Lecture.id == lecture_id,
            Lecture.status.in_([LectureStatus.PENDING, LectureStatus.FAILED]),
        )
        .update(
            {"status": LectureStatus.PROCESSING, "progress_step": STEP_FLASHCARDS if flashcards_only else 0,
             "error_message": None},
            synchronize_session=False,
        )
    )
    db.commit()
    return claimed == 1


def _generate_missing_cards(db, lecture, concepts: list, transcript: str) -> None:
    from app.models.flashcard import Flashcard
    from app.models.lecture import LectureStatus
    from app.models.user import User
    from app.services.concept_extraction import GeminiRequestError, generate_flashcards_for_concept, user_gemini_key
    from app.services.secret_box import decrypt_user_secret

    owner = db.query(User).filter(User.id == lecture.user_id).first()
    # A stored but unreadable personal key must never trigger shared-key billing.
    key = decrypt_user_secret(owner.gemini_api_key_enc) if owner else None
    token = user_gemini_key.set(key)
    try:
        completed_ids = {
            row[0] for row in db.query(Flashcard.concept_id)
            .filter(Flashcard.lecture_id == lecture.id).distinct().all()
        }
        failed = []
        for concept in concepts:
            concept_id = concept["id"]
            if concept_id in completed_ids:
                continue
            try:
                cards = _run_async(generate_flashcards_for_concept(
                    concept_name=concept["name"], definition=concept["definition"],
                    context=transcript[:3000],
                ))
            except GeminiRequestError as error:
                lecture.status = LectureStatus.FAILED
                lecture.progress_step = STEP_FLASHCARDS
                lecture.error_message = _public_error(error)
                lecture.failure_key_digest = error.key_fingerprint
                lecture.flashcard_count = db.query(Flashcard).filter(Flashcard.lecture_id == lecture.id).count()
                db.commit()
                logger.warning("Flashcard generation paused for lecture %s (%s)", lecture.id, error.code)
                return
            except Exception as error:
                failed.append(concept_id)
                logger.warning("Flashcard generation failed for concept %s (%s)", concept_id, type(error).__name__)
                continue

            for card_data in cards:
                db.add(Flashcard(
                    lecture_id=lecture.id, concept_id=concept_id,
                    concept_name=concept["name"], question=card_data["question"],
                    answer=card_data["answer"], next_review_at=datetime.utcnow(),
                ))
            # A whole concept batch is durable before the next Gemini request.
            db.commit()
            completed_ids.add(concept_id)

        lecture.flashcard_count = db.query(Flashcard).filter(Flashcard.lecture_id == lecture.id).count()
        if failed:
            lecture.status = LectureStatus.FAILED
            lecture.progress_step = STEP_FLASHCARDS
            lecture.error_message = f"[FLASHCARD:partial] Flashcards are partially generated; {len(failed)} concept batch(es) can be retried."
        else:
            lecture.status = LectureStatus.COMPLETED
            lecture.progress_step = STEP_FLASHCARDS
            lecture.error_message = None
            lecture.failure_key_digest = None
        if not lecture.title:
            lecture.title = f"Lecture ({len(concepts)} concepts)"
        db.commit()
        logger.info("Flashcards updated for lecture %s: %s cards, %s incomplete concepts",
                    lecture.id, lecture.flashcard_count, len(failed))
    finally:
        user_gemini_key.reset(token)


async def _store_graph_async(lecture_id: str, graph_data: dict):
    """Write to Neo4j with a private client (the API's singleton belongs to its own loop)."""
    from app.neo4j_client import Neo4jClient

    client = Neo4jClient()
    await client.connect()
    if not client.driver:
        return None
    try:
        # One transaction: idempotent on re-runs, never half-written.
        return await client.replace_lecture_graph(
            lecture_id, graph_data.get("concepts", []), graph_data.get("edges", [])
        )
    finally:
        await client.close()


def _process_lecture_impl(lecture_id: str, *, flashcards_only: bool = False):
    """
    Upload -> storage -> transcribe/extract -> concepts -> graph -> flashcards.

    Idempotent: a lecture that is already COMPLETED or being processed is left
    alone, and re-runs replace (never append to) flashcards and graph data.
    """
    from app.config import settings
    from app.models.flashcard import Flashcard
    from app.models.lecture import Lecture, LectureStatus
    from app.services.concept_extraction import extract_concepts_and_edges, user_gemini_key
    from app.services.documents import extract_pdf_text, is_pdf_file
    from app.services.graph_service import scope_graph_data
    from app.services.storage import fetch_file

    engine, Session = _session_factory()
    db = Session()
    try:
        if not _claim(db, lecture_id, flashcards_only=flashcards_only):
            logger.info("Lecture %s is not claimable (missing, running or done); skipping", lecture_id)
            return
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()

        if flashcards_only:
            if not lecture.transcript or not lecture.graph_data:
                raise ValueError("Persisted transcript or concept graph is missing; full lecture retry is required")
            _generate_missing_cards(db, lecture, json.loads(lecture.graph_data).get("concepts", []), lecture.transcript)
            return

        def update_step(step):
            lecture.progress_step = step
            db.commit()

        with tempfile.TemporaryDirectory(prefix="lecturemap_") as tmpdir:
            # ── 1. Fetch ────────────────────────────────────────────
            update_step(STEP_DOWNLOAD)
            ext = os.path.splitext(lecture.storage_path or "")[1] or ".bin"
            media_path = fetch_file(lecture.storage_path, os.path.join(tmpdir, f"lecture{ext}"))

            # ── 2. Transcribe / extract ─────────────────────────────
            update_step(STEP_TRANSCRIBE)
            if is_pdf_file(media_path):
                transcript, segments = extract_pdf_text(media_path), []
            else:
                from app.services.transcription import transcribe_audio

                transcript, segments = transcribe_audio(media_path)
            if not transcript.strip():
                raise ValueError("No readable lecture content was found in the uploaded file")
            lecture.transcript = transcript
            if segments:
                lecture.duration_seconds = int(segments[-1]["end"])
            db.commit()

            # ── 3. Concepts ─────────────────────────────────────────
            update_step(STEP_EXTRACT)
            from app.models.user import User
            from app.services.secret_box import decrypt_user_secret

            owner = db.query(User).filter(User.id == lecture.user_id).first()
            user_gemini_key.set(decrypt_user_secret(owner.gemini_api_key_enc) if owner else None)
            graph_data = _run_async(extract_concepts_and_edges(transcript, lecture_id))
            graph_data = {**scope_graph_data(lecture_id, graph_data), "source": graph_data.get("source", "gemini")}
            concepts, edges = graph_data["concepts"], graph_data["edges"]

            # ── 4. Graph (Neo4j optional; JSON snapshot is authoritative) ──
            update_step(STEP_GRAPH)
            try:
                _run_async(_store_graph_async(lecture_id, graph_data))
            except Exception as error:  # Neo4j must never fail the pipeline
                logger.warning("Neo4j storage skipped: %s", type(error).__name__)
            lecture.graph_data = json.dumps(graph_data)
            lecture.concept_count = len(concepts)
            lecture.edge_count = len(edges)
            db.commit()

            # ── 5. Flashcards (replace, never append) ───────────────
            update_step(STEP_FLASHCARDS)
            _generate_missing_cards(db, lecture, concepts, transcript)
    except Exception:
        db.rollback()
        raise
    finally:
        user_gemini_key.set(None)
        db.close()
        engine.dispose()
