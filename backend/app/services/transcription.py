import logging
import threading
from typing import List, Tuple

logger = logging.getLogger(__name__)

_models: dict = {}
_models_lock = threading.Lock()


def _get_model(model_size: str):
    """Load each Whisper model once per process; loading is serialised."""
    with _models_lock:
        if model_size not in _models:
            try:
                from faster_whisper import WhisperModel
            except ImportError as error:
                raise RuntimeError(
                    "Audio transcription needs faster-whisper. Install it with "
                    "`pip install faster-whisper`, or upload a text-based PDF."
                ) from error
            logger.info("Loading Whisper model '%s'", model_size)
            _models[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
        return _models[model_size]


def transcribe_audio(audio_path: str, model_size: str = "base") -> Tuple[str, List[dict]]:
    """Transcribe a locally available audio or video file with Whisper."""
    model = _get_model(model_size)
    logger.info("Transcribing uploaded media")
    segments, _ = model.transcribe(audio_path, beam_size=5)

    text_parts = []
    segment_list = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            text_parts.append(text)
            segment_list.append({"start": segment.start, "end": segment.end, "text": text})

    transcript = " ".join(text_parts).strip()
    if not transcript:
        raise ValueError("Whisper could not detect spoken content in this file")
    logger.info("Transcription complete: %s segments", len(segment_list))
    return transcript, segment_list
