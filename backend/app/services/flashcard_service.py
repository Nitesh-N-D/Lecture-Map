import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.flashcard import Flashcard
from app.services.concept_extraction import generate_flashcards_for_concept

logger = logging.getLogger(__name__)


async def generate_and_store_flashcards(
    db: AsyncSession,
    lecture_id: str,
    concepts: list,
    transcript: str = "",
) -> int:
    """Generate flashcards for all concepts and store in DB. Returns count."""
    count = 0
    for concept in concepts:
        try:
            cards = await generate_flashcards_for_concept(
                concept_name=concept["name"],
                definition=concept["definition"],
                context=transcript[:3000],
            )
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
                count += 1
        except Exception as e:
            logger.error(f"Failed to generate flashcards for concept {concept['id']}: {e}")
            continue

    await db.commit()
    logger.info(f"Generated {count} flashcards for lecture {lecture_id}")
    return count
