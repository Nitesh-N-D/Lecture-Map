"""Per-user settings: bring-your-own Gemini API key."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.concept_extraction import validate_gemini_key
from app.services.secret_box import decrypt_secret, encrypt_secret

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


class GeminiKeyRequest(BaseModel):
    api_key: str = Field(min_length=20, max_length=200)


def _status(user: User) -> dict:
    key = decrypt_secret(user.gemini_api_key_enc)
    return {"configured": bool(key), "last4": key[-4:] if key else None}


@router.get("/gemini-key")
async def get_gemini_key_status(current_user: User = Depends(get_current_user)):
    """Whether a personal key is saved. The key itself is never returned."""
    return _status(current_user)


@router.put("/gemini-key")
async def save_gemini_key(
    body: GeminiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = body.api_key.strip()
    if any(ch.isspace() for ch in key):
        raise HTTPException(400, "A Gemini key has no spaces. Paste only the key.")
    try:
        await run_in_threadpool(validate_gemini_key, key)
    except RuntimeError as error:
        raise HTTPException(400, str(error)) from error
    current_user.gemini_api_key_enc = encrypt_secret(key)
    await db.commit()
    logger.info("User %s saved a personal Gemini key", current_user.id)
    return _status(current_user)


@router.delete("/gemini-key")
async def delete_gemini_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.gemini_api_key_enc = None
    await db.commit()
    return _status(current_user)
