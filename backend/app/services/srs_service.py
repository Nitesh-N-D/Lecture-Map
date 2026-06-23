from datetime import datetime, timedelta
from app.models.flashcard import Flashcard
import logging

logger = logging.getLogger(__name__)


def sm2_update(card: Flashcard, quality: int) -> dict:
    """
    SM-2 spaced repetition algorithm.
    quality: 0-5
      0 = complete blackout
      1 = incorrect, remembered upon seeing answer
      2 = incorrect, easy recall upon seeing answer
      3 = correct with significant difficulty
      4 = correct after hesitation
      5 = perfect response

    Returns dict of updated fields.
    """
    ef = card.easiness_factor
    repetitions = card.repetitions
    interval = card.interval_days

    if quality < 3:
        # Failed — reset repetitions, restart interval
        repetitions = 0
        interval = 1
    else:
        # Successful recall
        if repetitions == 0:
            interval = 1
        elif repetitions == 1:
            interval = 6
        else:
            interval = round(interval * ef)
        repetitions += 1

    # Update easiness factor (EF)
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ef = max(1.3, ef)  # EF floor

    next_review_at = datetime.utcnow() + timedelta(days=interval)

    return {
        "easiness_factor": round(ef, 4),
        "interval_days": interval,
        "repetitions": repetitions,
        "next_review_at": next_review_at,
        "last_reviewed_at": datetime.utcnow(),
        "total_reviews": card.total_reviews + 1,
    }


def get_quality_preview(card: Flashcard) -> dict:
    """Preview what each rating would do to the card without saving."""
    previews = {}
    for q in [0, 2, 3, 5]:
        result = sm2_update(card, q)
        label = {0: "Again", 2: "Hard", 3: "Good", 5: "Easy"}[q]
        previews[label] = {
            "quality": q,
            "interval_days": result["interval_days"],
            "next_review_at": result["next_review_at"].isoformat(),
        }
    return previews
