"""Encrypt small per-user secrets (e.g. a bring-your-own Gemini key) at rest.

Fernet (AES-128-CBC + HMAC). The key is derived from ``KEY_ENCRYPTION_SECRET``
(falling back to ``JWT_SECRET``). Changing that secret makes stored keys
unreadable; users then simply re-enter them.
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class SecretDecryptionError(RuntimeError):
    """A stored encrypted secret cannot be read with the configured stable key."""


def _fernet() -> Fernet:
    secret = settings.KEY_ENCRYPTION_SECRET or settings.JWT_SECRET
    if not secret or secret == "change-me-in-production-256-bit-secret":
        raise RuntimeError("A stable KEY_ENCRYPTION_SECRET or JWT_SECRET is required to store user API keys")
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


def decrypt_user_secret(token: str | None) -> str | None:
    """Strictly decrypt a persisted user key; never treat a broken key as absent."""
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError) as error:
        raise SecretDecryptionError(
            "The saved Gemini key cannot be decrypted. Set the original stable encryption secret or replace the key in Settings."
        ) from None
