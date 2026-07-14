import os
import tempfile
import logging
import asyncio
from datetime import datetime

import app.models
from app.celery_app import celery_app

logger = logging.getLogger(__name__)

STEP_DOWNLOAD = 1
STEP_TRANSCRIBE = 2
STEP_EXTRACT = 3
STEP_GRAPH = 4
STEP_FLASHCARDS = 5


def _run_async(coro):
    """Run an async coroutine from the synchronous worker pipeline."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _sync_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if database_url.startswith("sqlite+aiosqlite:///"):
        return database_url.replace("sqlite+aiosqlite:///", "sqlite:///", 1)
    return database_url.replace("+asyncpg", "").replace("+aiosqlite", "")


def run_lecture_pipeline(lecture_id: str) -> None:
    """
    Process one lecture end-to-end.

    This function is deliberately plain synchronous Python so it can run
    either in Celery or as a FastAPI background-task fallback when Redis
    is unavailable.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings
    from app.models.lecture import Lecture, LectureStatus

    engine = create_engine(_sync_database_url(settings.DATABASE_URL), pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        if not lecture:
            logger.error("Lecture %s not found", lecture_id)
            return

        def update_status(status, step=None, error=None):
            lecture.status = status
            if step is not None:
                lecture.progress_step = step
            if error is not None:
                lecture.error_message = error
            db.commit()
            db.refresh(lecture)

        update_status(LectureStatus.PROCESSING, step=0, error=None)

        with tempfile.TemporaryDirectory() as tmpdir:
            update_status(LectureStatus.PROCESSING, step=STEP_DOWNLOAD)

            if lecture.youtube_url:
                from app.services.transcription import download_youtube_audio

                logger.info("Downloading YouTube lecture %s", lecture.youtube_url)
                audio_path = _run_async(download_youtube_audio(lecture.youtube_url, tmpdir))
            elif lecture.storage_path:
                from app.services.transcription import download_from_supabase

                local_path = os.path.join(tmpdir, "lecture_audio")
                audio_path = _run_async(download_from_supabase(lecture.storage_path, local_path))
            else:
                raise ValueError("No audio source found for this lecture")

            update_status(LectureStatus.PROCESSING, step=STEP_TRANSCRIBE)
            from app.services.transcription import transcribe_audio

            transcript, segments = transcribe_audio(audio_path, model_size="base")
            if not transcript.strip():
                raise ValueError("Transcription produced no text")

            lecture.transcript = transcript
            if segments:
                lecture.duration_seconds = int(segments[-1]["end"])
            db.commit()

            update_status(LectureStatus.PROCESSING, step=STEP_EXTRACT)
            from app.services.concept_extraction import extract_concepts_and_edges

            graph_data = _run_async(extract_concepts_and_edges(transcript, lecture_id))
            concepts = graph_data.get("concepts", [])
            if not concepts:
                raise ValueError("No concepts were extracted from the transcript")

            update_status(LectureStatus.PROCESSING, step=STEP_GRAPH)
            from app.services.graph_service import store_graph
            from app.neo4j_client import neo4j_client

            async def _store():
                await neo4j_client.connect()
                return await store_graph(lecture_id, graph_data)

            node_count, edge_count = _run_async(_store())
            lecture.concept_count = node_count
            lecture.edge_count = edge_count
            db.commit()

            update_status(LectureStatus.PROCESSING, step=STEP_FLASHCARDS)
            from app.models.flashcard import Flashcard
            from app.services.concept_extraction import generate_flashcards_for_concept

            flashcard_count = 0
            for concept in concepts:
                concept_id = concept.get("id")
                concept_name = concept.get("name")
                definition = concept.get("definition") or ""
                if not concept_id or not concept_name:
                    continue

                cards = _run_async(
                    generate_flashcards_for_concept(
                        concept_name=concept_name,
                        definition=definition,
                        context=transcript[:3000],
                    )
                )
                for card_data in cards:
                    question = card_data.get("question")
                    answer = card_data.get("answer")
                    if not question or not answer:
                        continue
                    db.add(
                        Flashcard(
                            lecture_id=lecture_id,
                            concept_id=concept_id,
                            concept_name=concept_name,
                            question=question,
                            answer=answer,
                            next_review_at=datetime.utcnow(),
                        )
                    )
                    flashcard_count += 1

            if flashcard_count == 0:
                raise ValueError("No flashcards were generated")

            db.commit()
            lecture.flashcard_count = flashcard_count

            if not lecture.title:
                lecture.title = f"Lecture ({node_count} concepts)"

            update_status(LectureStatus.COMPLETED, step=STEP_FLASHCARDS)
            logger.info(
                "Pipeline complete for lecture %s: %s concepts, %s edges, %s flashcards",
                lecture_id,
                node_count,
                edge_count,
                flashcard_count,
            )

    except Exception as e:
        logger.exception("Pipeline failed for lecture %s: %s", lecture_id, e)
        try:
            lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
            if lecture:
                lecture.status = LectureStatus.FAILED
                lecture.error_message = str(e)
                db.commit()
        except Exception:
            logger.exception("Failed to persist pipeline error for lecture %s", lecture_id)
        raise
    finally:
        db.close()


@celery_app.task(bind=True, max_retries=2, name="tasks.process_lecture")
def process_lecture(self, lecture_id: str):
    try:
        run_lecture_pipeline(lecture_id)
    except Exception as e:
        raise self.retry(exc=e, countdown=30)
