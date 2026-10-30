"""Upload storage: Supabase Storage or a local directory.

``lectures.storage_path`` holds a reference string:

* ``local:<user_id>/<lecture_id>.<ext>``  – file under ``settings.UPLOAD_DIR``
* ``supabase:<user_id>/<lecture_id>.<ext>`` – object in ``settings.SUPABASE_BUCKET``
* anything else is a legacy value: an absolute local path or a bare Supabase key
"""
import logging
import os
import shutil
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


class StorageError(RuntimeError):
    pass


def supabase_configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_KEY)


def upload_root() -> Path:
    return Path(settings.UPLOAD_DIR).resolve()


def _local_target(key: str) -> Path:
    root = upload_root()
    target = (root / key).resolve()
    if root != target and root not in target.parents:
        raise StorageError("Invalid storage path")
    return target


def _supabase():
    from supabase import create_client

    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)


def save_file(tmp_path: str, key: str, content_type: str) -> str:
    """Persist ``tmp_path`` and return the storage reference."""
    if supabase_configured():
        try:
            with open(tmp_path, "rb") as handle:
                _supabase().storage.from_(settings.SUPABASE_BUCKET).upload(
                    path=key,
                    file=handle,
                    file_options={"content-type": content_type},
                )
            return f"supabase:{key}"
        except Exception as error:
            if not settings.ALLOW_LOCAL_STORAGE_FALLBACK:
                logger.error("Supabase upload failed: %s", type(error).__name__)
                raise StorageError("File storage is unavailable. Please try again later.") from error
            logger.warning("Supabase upload failed; using local storage (fallback enabled)")
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
        content = _supabase().storage.from_(settings.SUPABASE_BUCKET).download(key)
    except Exception as error:
        raise StorageError("Could not download the uploaded file from storage") from error
    with open(dest_path, "wb") as output:
        output.write(content)
    return dest_path


def delete_file(ref: str | None) -> None:
    """Best-effort removal; never raises."""
    if not ref:
        return
    try:
        if ref.startswith("local:"):
            _local_target(ref[len("local:"):]).unlink(missing_ok=True)
        elif ref.startswith("supabase:") or not os.path.isabs(ref):
            if supabase_configured():
                key = ref[len("supabase:"):] if ref.startswith("supabase:") else ref
                _supabase().storage.from_(settings.SUPABASE_BUCKET).remove([key])
        # Legacy absolute local paths are left alone: they predate UPLOAD_DIR
        # and are not guaranteed to be inside a directory this app owns.
    except Exception as error:  # noqa: BLE001
        logger.warning("Could not delete stored file: %s", type(error).__name__)
