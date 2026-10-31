"""Upload storage: Supabase Storage or a local directory.

``lectures.storage_path`` holds a reference string:

* ``local:<user_id>/<lecture_id>.<ext>``  – file under ``settings.UPLOAD_DIR``
* ``supabase:<user_id>/<lecture_id>.<ext>`` – object in ``settings.SUPABASE_BUCKET``
* anything else is a legacy value: an absolute local path or a bare Supabase key

Object keys are always built by the server from the owner's user id and a
server-generated lecture id, never from the client's file name, so a caller
cannot address another user's objects or escape the bucket/upload root.

The Supabase key is a *server-side* credential (``sb_secret_...`` or a legacy
``service_role`` JWT). Publishable/anon keys are rejected with an actionable
error because Storage RLS blocks them and they would fail on every upload.
"""
import base64
import json
import logging
import os
import re
import shutil
from functools import lru_cache
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,8}$")
_USER_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class StorageError(RuntimeError):
    pass


def supabase_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


def supabase_key_kind(key: str | None = None) -> str:
    """Classify a Supabase API key without ever logging it.

    Returns ``secret``, ``service_role``, ``publishable``, ``anon``, ``missing`` or ``unknown``.
    """
    key = (settings.SUPABASE_KEY if key is None else key).strip()
    if not key:
        return "missing"
    if key.startswith("sb_secret_"):
        return "secret"
    if key.startswith("sb_publishable_"):
        return "publishable"
    parts = key.split(".")
    if len(parts) == 3:  # legacy JWT key: read the role claim (no verification needed)
        try:
            payload = parts[1] + "=" * (-len(parts[1]) % 4)
            role = json.loads(base64.urlsafe_b64decode(payload)).get("role")
        except (ValueError, AttributeError):
            role = None
        if role in ("service_role", "anon"):
            return role
    return "unknown"


def storage_status() -> dict:
    """Non-secret summary used by /health and startup logs."""
    if not supabase_configured():
        backend = "unconfigured" if settings.ENVIRONMENT == "production" else "local"
        return {"backend": backend, "ok": backend == "local"}
    kind = supabase_key_kind()
    return {"backend": "supabase", "ok": kind in ("secret", "service_role", "unknown"), "key_type": kind}


def _require_server_key() -> None:
    if supabase_key_kind() in ("publishable", "anon"):
        raise StorageError(
            "File storage is misconfigured: SUPABASE_KEY is a public (publishable/anon) key. "
            "Set it to the project's secret key (sb_secret_...) on the server."
        )


def upload_root() -> Path:
    return Path(settings.UPLOAD_DIR).resolve()


def validate_key(key: str) -> str:
    if not _KEY_RE.match(key or ""):
        raise StorageError("Invalid storage path")
    return key


def _local_target(key: str) -> Path:
    root = upload_root()
    target = (root / key).resolve()
    if root != target and root not in target.parents:
        raise StorageError("Invalid storage path")
    return target


@lru_cache(maxsize=4)
def _client(url: str, key: str):
    from supabase import create_client

    return create_client(url, key)


def _bucket():
    _require_server_key()
    return _client(settings.SUPABASE_URL, settings.SUPABASE_KEY).storage.from_(settings.SUPABASE_BUCKET)


def save_file(tmp_path: str, key: str, content_type: str) -> str:
    """Persist ``tmp_path`` and return the storage reference."""
    validate_key(key)
    if supabase_configured():
        try:
            with open(tmp_path, "rb") as handle:
                _bucket().upload(
                    path=key,
                    file=handle,
                    file_options={"content-type": content_type, "upsert": "false"},
                )
            return f"supabase:{key}"
        except StorageError:
            raise
        except Exception as error:
            if not settings.ALLOW_LOCAL_STORAGE_FALLBACK:
                logger.error("Supabase upload failed: %s", type(error).__name__)
                raise StorageError(
                    "File storage is unavailable right now. Please try again in a few minutes."
                ) from error
            logger.warning("Supabase upload failed; using local storage (fallback enabled)")
    elif settings.ENVIRONMENT == "production":
        # Local disk on a hosted container is wiped on every deploy: never use it silently.
        logger.error("Upload refused: SUPABASE_URL/SUPABASE_KEY are not configured in production")
        raise StorageError("File storage is not configured on this server. Please contact the site owner.")
    target = _local_target(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tmp_path, target)
    return f"local:{key}"


def fetch_file(ref: str, dest_path: str) -> str:
    """Return a readable local path for ``ref`` (downloading if remote)."""
    if not ref:
        raise StorageError("No uploaded file is available for this lecture")
    if ref.startswith("local:"):
        path = _local_target(ref[len("local:"):])
        if not path.exists():
            raise StorageError("The uploaded file is no longer available on this server")
        return str(path)
    if ref.startswith("supabase:"):
        key = ref[len("supabase:"):]
    elif os.path.isabs(ref) and os.path.exists(ref):
        return ref  # legacy local path
    else:
        key = ref  # legacy bare supabase key
    if not supabase_configured():
        raise StorageError("The uploaded file is unavailable: Supabase storage is not configured")
    try:
        content = _bucket().download(key)
    except StorageError:
        raise
    except Exception as error:
        logger.error("Supabase download failed: %s", type(error).__name__)
        raise StorageError("Could not download the uploaded file from storage") from error
    with open(dest_path, "wb") as output:
        output.write(content)
    return dest_path


def delete_file(ref: str | None) -> bool:
    """Best-effort removal; never raises. Returns True when the object is gone."""
    if not ref:
        return True
    try:
        if ref.startswith("local:"):
            _local_target(ref[len("local:"):]).unlink(missing_ok=True)
            return True
        if ref.startswith("supabase:") or not os.path.isabs(ref):
            if not supabase_configured():
                logger.warning("Stored object not deleted: Supabase storage is not configured")
                return False
            key = ref[len("supabase:"):] if ref.startswith("supabase:") else ref
            _bucket().remove([key])
            return True
        # Legacy absolute local paths are left alone: they predate UPLOAD_DIR
        # and are not guaranteed to be inside a directory this app owns.
        return False
    except Exception as error:  # noqa: BLE001
        logger.warning("Could not delete stored file: %s", type(error).__name__)
        return False


def list_user_objects(user_id: str) -> list[str]:
    """Keys stored under a user's prefix (used for orphan cleanup)."""
    if not _USER_RE.match(user_id or ""):
        return []
    if supabase_configured():
        entries = _bucket().list(user_id) or []
        return [f"{user_id}/{e['name']}" for e in entries if e.get("name")]
    folder = _local_target(user_id)
    if not folder.is_dir():
        return []
    return [f"{user_id}/{p.name}" for p in folder.iterdir() if p.is_file()]


def remove_orphans(user_id: str, known_refs: set[str]) -> int:
    """Delete objects under ``user_id/`` that no lecture row references."""
    known = {r.split(":", 1)[-1] for r in known_refs if r}
    prefix = "supabase:" if supabase_configured() else "local:"
    removed = 0
    try:
        for key in list_user_objects(user_id):
            if key not in known and delete_file(prefix + key):
                removed += 1
    except Exception as error:  # noqa: BLE001
        logger.warning("Orphan scan failed: %s", type(error).__name__)
    return removed
