import logging
import re
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.flashcard import Flashcard
from app.models.lecture import Lecture
from app.auth import get_current_user
from app.services.export_service import export_anki, export_pdf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/export", tags=["export"])


def _content_disposition(title: str | None, ext: str) -> str:
    """Header-safe attachment name: ASCII fallback plus RFC 5987 UTF-8 name."""
    base = re.sub(r"\s+", "_", (title or "lecture").strip())
    base = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "", base).strip("._") or "lecture"
    base = base[:80]
    ascii_name = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return f"attachment; filename=\"{ascii_name}.{ext}\"; filename*=UTF-8''{quote(base)}.{ext}"


async def _get_lecture_cards(lecture_id: str, user_id: str, db: AsyncSession):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == user_id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    cards_result = await db.execute(
        select(Flashcard).where(Flashcard.lecture_id == lecture_id)
    )
    return lecture, cards_result.scalars().all()


@router.get("/anki/{lecture_id}")
async def export_anki_deck(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture, cards = await _get_lecture_cards(lecture_id, current_user.id, db)
    if not cards:
        raise HTTPException(404, "No flashcards found for this lecture")

    apkg_bytes = export_anki(list(cards), deck_name=lecture.title or "LectureMap")
    return Response(
        content=apkg_bytes,
        media_type="application/octet-stream",
        headers={"Content-Disposition": _content_disposition(lecture.title, "apkg")},
    )


@router.get("/pdf/{lecture_id}")
async def export_pdf_doc(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture, cards = await _get_lecture_cards(lecture_id, current_user.id, db)
    if not cards:
        raise HTTPException(404, "No flashcards found for this lecture")

    pdf_bytes = export_pdf(list(cards), title=lecture.title or "LectureMap Export")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": _content_disposition(lecture.title, "pdf")},
    )
