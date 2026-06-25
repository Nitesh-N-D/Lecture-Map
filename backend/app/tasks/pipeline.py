import os
import tempfile
import logging
import asyncio
import app.models
from app.celery_app import celery_app

logger = logging.getLogger(__name__)

STEP_DOWNLOAD = 1
STEP_TRANSCRIBE = 2
STEP_EXTRACT = 3
STEP_GRAPH = 4
STEP_FLASHCARDS = 5


def _run_async(coro):
    """Run async coroutine from sync Celery task."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=2, name="tasks.process_lecture")
def process_lecture(self, lecture_id: str):
    """
    Main pipeline task:
    1. Download audio (YouTube or Supabase)
    2. Transcribe with Whisper
    3. Extract concepts + edges with Gemini
    4. Store graph in Neo4j
    5. Generate flashcards
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    # Use sync engine for Celery (asyncpg can't run in Celery easily)
    sync_db_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        from app.models.lecture import Lecture, LectureStatus

        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        if not lecture:
            logger.error(f"Lecture {lecture_id} not found")
            return

        def update_status(status, step=None, error=None):
            lecture.status = status
            if step is not None:
                lecture.progress_step = step
            if error:
                lecture.error_message = error
            db.commit()
            db.refresh(lecture)

        update_status(LectureStatus.PROCESSING, step=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = None

            # ── Step 1: Download ────────────────────────────────────────
            update_status(LectureStatus.PROCESSING, step=STEP_DOWNLOAD)

            if lecture.youtube_url:
                logger.info(f"Downloading YouTube: {lecture.youtube_url}")
                from app.services.transcription import download_youtube_audio
                audio_path = _run_async(
                    download_youtube_audio(lecture.youtube_url, tmpdir)
                )
                if not lecture.title:
                    import re
                    lecture.title = f"YouTube Lecture"
                    db.commit()
            elif lecture.storage_path:
                local_path = os.path.join(tmpdir, "lecture_audio.mp3")
                from app.services.transcription import download_from_supabase
                audio_path = _run_async(
                    download_from_supabase(lecture.storage_path, local_path)
                )
            else:
                raise ValueError("No audio source: neither youtube_url nor storage_path set")

            # ── Step 2: Transcribe ──────────────────────────────────────
            update_status(LectureStatus.PROCESSING, step=STEP_TRANSCRIBE)
            from app.services.transcription import transcribe_audio
            transcript, segments = transcribe_audio(audio_path, model_size="base")

            lecture.transcript = transcript
            if segments:
                lecture.duration_seconds = int(segments[-1]["end"])
            db.commit()

            # ── Step 3: Extract concepts ────────────────────────────────
            update_status(LectureStatus.PROCESSING, step=STEP_EXTRACT)
            from app.services.concept_extraction import extract_concepts_and_edges
            graph_data = _run_async(
                extract_concepts_and_edges(transcript, lecture_id)
            )
            concepts = graph_data.get("concepts", [])
            edges = graph_data.get("edges", [])

            # ── Step 4: Store in Neo4j ──────────────────────────────────
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

            # ── Step 5: Generate flashcards ─────────────────────────────
            update_status(LectureStatus.PROCESSING, step=STEP_FLASHCARDS)
            from app.models.flashcard import Flashcard
            from app.services.concept_extraction import generate_flashcards_for_concept
            from datetime import datetime

            flashcard_count = 0
            for concept in concepts:
                try:
                    cards = _run_async(generate_flashcards_for_concept(
                        concept_name=concept["name"],
                        definition=concept["definition"],
                        context=transcript[:3000],
                    ))
                    for card_data in cards:
                        card = Flashcard(
                            lecture_id=lecture_id,
                            concept_id=concept["id"],
                            concept_name=concept["name"],
                            question=card_data["question"],
                            answer=card_data["answer"],
                            next_review_at=datetime.utcnow(),
                        )
                        db.add(card)
                        flashcard_count += 1
                except Exception as e:
                    logger.error(f"Flashcard gen error for {concept['id']}: {e}")

            db.commit()
            lecture.flashcard_count = flashcard_count

            # Auto-title if not set
            if not lecture.title:
                lecture.title = f"Lecture ({node_count} concepts)"

            update_status(LectureStatus.COMPLETED, step=5)
            logger.info(f"Pipeline complete for lecture {lecture_id}: "
                        f"{node_count} concepts, {edge_count} edges, {flashcard_count} flashcards")

    except Exception as e:
        logger.exception(f"Pipeline failed for lecture {lecture_id}: {e}")
        try:
            from app.models.lecture import LectureStatus
            lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
            if lecture:
                lecture.status = LectureStatus.FAILED
                lecture.error_message = str(e)
                db.commit()
        except Exception:
            pass
        raise self.retry(exc=e, countdown=30)
    finally:
        db.close()
