"""Encrypt small per-user secrets (e.g. a bring-your-own Gemini key) at rest.

Fernet (AES-128-CBC + HMAC). The key is derived from ``KEY_ENCRYPTION_SECRET``
(falling back to ``JWT_SECRET``). Changing that secret makes stored keys
unreadable; users then simply re-enter them.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    secret = settings.KEY_ENCRYPTION_SECRET or settings.JWT_SECRET
    digest = hashlib.sha256(f"lecturemap:user-secret:{secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
