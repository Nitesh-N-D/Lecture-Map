import logging
import os
from typing import List, Tuple

logger = logging.getLogger(__name__)


def transcribe_audio(audio_path: str, model_size: str = "base") -> Tuple[str, List[dict]]:
    """Transcribe a locally available audio or video file with Whisper."""
    from faster_whisper import WhisperModel

    logger.info("Loading Whisper model '%s'", model_size)
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    logger.info("Transcribing %s", audio_path)
    segments, _ = model.transcribe(audio_path, beam_size=5)

    text_parts = []
    segment_list = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            text_parts.append(text)
            segment_list.append(
                {"start": segment.start, "end": segment.end, "text": text}
            )

    transcript = " ".join(text_parts).strip()
    if not transcript:
        raise ValueError("Whisper could not detect spoken content in this file")
    logger.info("Transcription complete: %s segments", len(segment_list))
    return transcript, segment_list


async def download_from_supabase(storage_path: str, local_path: str) -> str:
    """Resolve a local upload or download an object from configured storage."""
    if os.path.exists(storage_path):
        return storage_path

    from app.config import settings

    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise RuntimeError("The uploaded file is unavailable from local or configured storage")

    from supabase import create_client

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    content = client.storage.from_(settings.SUPABASE_BUCKET).download(storage_path)
    with open(local_path, "wb") as output:
        output.write(content)
    return local_path
