import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.flashcard import Flashcard
from app.models.lecture import Lecture
from app.models.user import User
from app.services.concept_extraction import generate_flashcards_for_concept, user_gemini_key
from app.services.secret_box import decrypt_user_secret

logger = logging.getLogger(__name__)


async def generate_and_store_flashcards(
    db: AsyncSession,
    lecture_id: str,
    concepts: list,
    transcript: str = "",
) -> int:
    """Generate flashcards for all concepts and store in DB. Returns count."""
    lecture = await db.get(Lecture, lecture_id)
    if not lecture:
        raise ValueError("Lecture not found")
    owner = await db.get(User, lecture.user_id)
    token = user_gemini_key.set(decrypt_user_secret(owner.gemini_api_key_enc) if owner else None)
    count = 0
    try:
        existing = (await db.execute(
            select(Flashcard.concept_id).where(Flashcard.lecture_id == lecture_id).distinct()
        )).scalars().all()
        completed_ids = set(existing)
        for concept in concepts:
            if concept["id"] in completed_ids:
                continue
            try:
                cards = await generate_flashcards_for_concept(
                    concept_name=concept["name"],
                    definition=concept["definition"],
                    context=transcript[:3000],
                )
                for card_data in cards:
                    db.add(Flashcard(
                        lecture_id=lecture_id,
                        concept_id=concept["id"],
                        concept_name=concept["name"],
                        question=card_data["question"],
                        answer=card_data["answer"],
                        next_review_at=datetime.utcnow(),
                    ))
                    count += 1
                await db.commit()
                completed_ids.add(concept["id"])
            except Exception as error:
                await db.rollback()
                logger.warning("Flashcard batch stopped for concept %s (%s)", concept["id"], type(error).__name__)
                raise
    finally:
        user_gemini_key.reset(token)
    logger.info(f"Generated {count} flashcards for lecture {lecture_id}")
    return count
