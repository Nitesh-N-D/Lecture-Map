import os
import re
import logging
import tempfile
from pathlib import Path
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)


def is_youtube_url(url: str) -> bool:
    youtube_pattern = re.compile(
        r"(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)[\w-]+"
    )
    return bool(youtube_pattern.match(url))


async def download_youtube_audio(url: str, output_dir: str) -> str:
    """Download YouTube audio using yt-dlp, return path to mp3 file."""
    import subprocess

    output_template = os.path.join(output_dir, "%(id)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", output_template,
        "--no-playlist",
        url,
    ]
    logger.info(f"Downloading YouTube audio: {url}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr}")

    # Find the downloaded file
    mp3_files = list(Path(output_dir).glob("*.mp3"))
    if not mp3_files:
        raise RuntimeError("yt-dlp downloaded nothing")

    return str(mp3_files[0])


def transcribe_audio(audio_path: str, model_size: str = "base") -> Tuple[str, List[dict]]:
    """
    Transcribe audio using faster-whisper.
    Returns (full_transcript, segments_with_timestamps)
    """
    from faster_whisper import WhisperModel

    logger.info(f"Loading Whisper model '{model_size}'")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    logger.info(f"Transcribing: {audio_path}")
    segments, info = model.transcribe(audio_path, beam_size=5)

    full_text_parts = []
    segment_list = []

    for segment in segments:
        text = segment.text.strip()
        full_text_parts.append(text)
        segment_list.append({
            "start": segment.start,
            "end": segment.end,
            "text": text,
        })

    full_transcript = " ".join(full_text_parts)
    logger.info(f"Transcription complete: {len(segment_list)} segments, {len(full_transcript)} chars")
    return full_transcript, segment_list


async def download_from_supabase(storage_path: str, local_path: str) -> str:
    """Download a file from Supabase Storage to a local path."""
    from app.config import settings
    from supabase import create_client

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    response = client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)

    with open(local_path, "wb") as f:
        f.write(response)

    logger.info(f"Downloaded from Supabase: {storage_path} → {local_path}")
    return local_path


async def upload_to_supabase(local_path: str, storage_path: str, content_type: str = "audio/mpeg") -> str:
    """Upload a local file to Supabase Storage, return the storage path."""
    from app.config import settings
    from supabase import create_client

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

    with open(local_path, "rb") as f:
        client.storage.from_(settings.SUPABASE_BUCKET).upload(
            path=storage_path,
            file=f,
            file_options={"content-type": content_type},
        )

    logger.info(f"Uploaded to Supabase: {local_path} → {storage_path}")
    return storage_path
