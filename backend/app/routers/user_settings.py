"""Per-user settings: bring-your-own Gemini API key."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.concept_extraction import GeminiRequestError, test_gemini_key, validate_gemini_key, user_gemini_key
from app.services.secret_box import decrypt_user_secret, encrypt_secret

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


class GeminiKeyRequest(BaseModel):
    api_key: str = Field(min_length=20, max_length=200)


class GeminiKeyTestRequest(BaseModel):
    api_key: str | None = Field(default=None, min_length=20, max_length=200)


def _status(user: User) -> dict:
    encrypted = user.gemini_api_key_enc
    try:
        key = decrypt_user_secret(encrypted) if encrypted else None
    except RuntimeError:
        return {"configured": True, "last4": None, "needs_replacement": True}
    return {"configured": bool(encrypted), "last4": key[-4:] if key else None}


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


@router.post("/gemini-key/test")
async def test_saved_gemini_key(
    body: GeminiKeyTestRequest | None = None,
    current_user: User = Depends(get_current_user),
):
    """Test a candidate or saved key with a fixed minimal request; never return it."""
    key = (body.api_key.strip() if body and body.api_key else None)
    if key is None:
        try:
            key = decrypt_user_secret(current_user.gemini_api_key_enc)
        except RuntimeError as error:
            raise HTTPException(409, str(error)) from None
    if not key:
        raise HTTPException(400, "Save a Gemini API key before testing it.")
    token = user_gemini_key.set(key)
    try:
        await test_gemini_key()
        return {"valid": True, "message": "Gemini API key is working."}
    except GeminiRequestError as error:
        status = 429 if error.code == "quota_exhausted" else 400 if error.code in {"invalid_api_key", "authentication_failed", "invalid_model"} else 502
        raise HTTPException(status, str(error)) from None
    finally:
        user_gemini_key.reset(token)
