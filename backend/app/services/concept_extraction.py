import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
import logging
import random
import re
import threading
from collections import Counter
from contextvars import ContextVar

import google.generativeai as genai
from app.config import settings
from app.services.graph_algorithms import break_cycles, normalize_name

logger = logging.getLogger(__name__)


EXTRACTION_PROMPT = """You are an expert knowledge graph builder. Given this lecture transcript, extract:
1. Key concepts (15-30 concepts for a 1-hour lecture, fewer for shorter content)
2. Prerequisite dependency edges between concepts

Return ONLY valid JSON with this exact structure:
{{
  "concepts": [
    {{
      "id": "unique_snake_case_id",
      "name": "Concept Name",
      "definition": "2-3 sentence definition from the lecture context",
      "timestamp_seconds": 0,
      "difficulty": "beginner|intermediate|advanced"
    }}
  ],
  "edges": [
    {{
      "from": "prerequisite_concept_id",
      "to": "dependent_concept_id",
      "strength": 0.9
    }}
  ]
}}

Rules:
- An edge from A to B means "you must understand A before B"
- strength is 0.0-1.0
- timestamp_seconds is the approximate second where the concept first appears
- Extract real prerequisite relationships, not just topic associations
- Concepts should form a DAG with no cycles
- ids must be unique, snake_case, and descriptive

Transcript:
{transcript}
"""

FLASHCARD_PROMPT = """You are an expert educator creating spaced-repetition flashcards.
Given a concept name, definition, and lecture context, generate exactly 2 high-quality Q&A flashcards.

Concept: {concept_name}
Definition: {definition}
Lecture context: {context}

Return ONLY valid JSON array:
[
  {{
    "question": "Clear, specific question testing deep understanding",
    "answer": "Concise, accurate answer (1-3 sentences)"
  }},
  {{
    "question": "Different angle or application question",
    "answer": "Concise, accurate answer (1-3 sentences)"
  }}
]

Rules:
- Questions should require understanding, not just recall
- Avoid shallow wording such as "What is..."
- Answers should be self-contained and precise
"""


VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
CHUNK_CHARS = 30_000
MAX_CHUNKS = 6
class GeminiRequestError(RuntimeError):
    """Safe user-facing Gemini error with a machine-readable failure class."""

    def __init__(self, code: str, message: str, *, retryable: bool = False,
                 key_fingerprint: str | None = None, retry_after: float | None = None):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.key_fingerprint = key_fingerprint
        self.retry_after = retry_after


def _retry_after_seconds(error: Exception) -> float | None:
    value = getattr(error, "retry_after", None) or getattr(error, "retry_delay", None)
    if value is not None:
        if hasattr(value, "total_seconds"):
            return max(0.0, value.total_seconds())
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            pass
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", {}) or {}
    value = headers.get("Retry-After") if hasattr(headers, "get") else None
    try:
        return max(0.0, float(value)) if value is not None else None
    except (TypeError, ValueError):
        try:
            when = parsedate_to_datetime(str(value))
            return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


def _classify_gemini_error(error: Exception) -> tuple[str, bool, float | None]:
    name = type(error).__name__.lower()
    message = str(error).lower()
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    try:
        status = int(status)
    except (TypeError, ValueError):
        status = getattr(getattr(error, "response", None), "status_code", None)
    if status == 429 or name in {"resourceexhausted", "toomanyrequests"} or "resource_exhausted" in message or "quota" in message:
        return "quota_exhausted", False, _retry_after_seconds(error)
    if status == 404 or name == "notfound" or "model not found" in message:
        return "invalid_model", False, None
    if status in (401, 403) or name in {"permissiondenied", "unauthenticated"}:
        return ("invalid_api_key" if "api key" in message or status == 401 else "authentication_failed"), False, None
    if (status == 400 or name == "invalidargument") and ("api key" in message or "key not valid" in message):
        return "invalid_api_key", False, None
    if status == 400 and "model" in message:
        return "invalid_model", False, None
    if status in (500, 502, 503, 504) or name in {"internalservererror", "serviceunavailable", "deadlineexceeded"}:
        return "temporary_server_error", True, _retry_after_seconds(error)
    if isinstance(error, (TimeoutError, asyncio.TimeoutError)) or "timeout" in name or "timed out" in message or "deadline" in message:
        return "network_timeout", True, _retry_after_seconds(error)
    if isinstance(error, (ConnectionError, OSError)):
        return "network_error", True, _retry_after_seconds(error)
    return "permanent_failure", False, None


def _failure_message(code: str) -> str:
    if code == "quota_exhausted":
        return ("Your Gemini key has exhausted its API quota. Wait for it to reset, or update your key in Settings."
                if _using_user_key() else
                "The shared Gemini API quota has been exhausted. Retry later. Add your own free Gemini key in Settings.")
    if code == "invalid_api_key":
        return "Your Gemini API key is invalid. Update it in Settings." if _using_user_key() else "The configured Gemini API key is invalid. Contact support or try again later."
    if code == "authentication_failed":
        return "Gemini authentication failed. Check GEMINI_API_KEY."
    if code == "invalid_model":
        return "The configured Gemini model is unavailable. Check GEMINI_MODEL."
    if code == "temporary_server_error":
        return "Gemini is temporarily unavailable. Retry generation in a moment."
    if code in {"network_timeout", "network_error"}:
        return "The Gemini request timed out or could not connect. Retry generation."
    if code == "api_key_required":
        return "Gemini is not configured. Add a Gemini API key in Settings to generate flashcards."
    return "Gemini could not complete this request. Check the API key and model, then retry."


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    return slug[:64]


# A user's own key, set by the pipeline for the duration of one lecture. It takes
# precedence over the shared server key.
user_gemini_key: ContextVar[str | None] = ContextVar("user_gemini_key", default=None)
# genai.configure() is process-global, so configure + call is serialised.
_gemini_lock = threading.Lock()


def active_gemini_key() -> str:
    return user_gemini_key.get() or settings.GEMINI_API_KEY


def _using_user_key() -> bool:
    return bool(user_gemini_key.get())


def _configure_gemini():
    if not active_gemini_key():
        raise GeminiRequestError("api_key_required", _failure_message("api_key_required"))
    return genai.GenerativeModel(settings.GEMINI_MODEL)


def _call_model(model, prompt: str, config, key: str):
    with _gemini_lock:
        genai.configure(api_key=key)
        return model.generate_content(prompt, generation_config=config)


def validate_gemini_key(key: str) -> None:
    """Raise RuntimeError with a safe message unless ``key`` can list models (uses no generation quota)."""
    try:
        with _gemini_lock:
            genai.configure(api_key=key)
            next(iter(genai.list_models()), None)
    except Exception as error:  # noqa: BLE001 - SDK raises many types
        name = type(error).__name__
        if name in {"ResourceExhausted", "TooManyRequests"}:
            return  # the key is valid, just rate-limited right now
        if name in {"PermissionDenied", "Unauthenticated", "InvalidArgument"} or "api key" in str(error).lower():
            raise RuntimeError("Google rejected this key. Check that you copied the whole key.") from error
        raise RuntimeError("Could not reach Google to check the key. Try again in a moment.") from error


def _local_concept_fallback(transcript: str) -> dict:
    """Create a small extractive study set when Gemini is not configured.

    It only reuses frequent terms and the sentences that contain them. It does
    NOT infer prerequisite relationships (that needs real understanding), so the
    result has no edges and is flagged ``source: extractive_fallback``.
    """
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", transcript) if len(s.strip()) > 35]
    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", transcript.lower())
    stop_words = {"about", "after", "also", "because", "between", "could", "each", "from", "have", "into", "more", "most", "other", "over", "should", "that", "the", "their", "there", "these", "this", "those", "through", "using", "with", "would", "your", "which", "where", "when", "what", "will", "they", "them", "then", "than", "were", "been", "being", "does", "just", "like", "very", "some", "such", "only"}
    candidates = [word for word in words if word not in stop_words]
    ranked = [word for word, _ in Counter(candidates).most_common(12)]
    concepts = []
    for term in ranked:
        if len(concepts) >= 8:
            break
        context = next((sentence for sentence in sentences if term in sentence.lower()), "")
        if not context:
            continue
        concepts.append({
            "id": _slugify(term),
            "name": term.replace("-", " ").title(),
            "definition": context[:500],
            "timestamp_seconds": 0,
            "difficulty": "intermediate",
        })
    if not concepts:
        concepts = [{"id": "lecture_overview", "name": "Lecture overview", "definition": transcript[:500], "timestamp_seconds": 0, "difficulty": "intermediate"}]
    return {"concepts": concepts, "edges": [], "source": "extractive_fallback"}


def _load_json_from_model_text(raw_text: str):
    raw_text = raw_text.strip()
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        match = re.search(r"(\{.*\}|\[.*\])", raw_text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def _clean_float(value, default, low, high):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return min(high, max(low, number))


def normalize_graph(concepts: list, edges: list) -> tuple[list, list]:
    """Validate and normalise raw model output into a clean DAG.

    - ids are slugified and made unique; concepts with the same normalised name
      are merged (first definition wins, earliest timestamp kept)
    - concepts without a name or a usable definition are dropped
    - edges are remapped to surviving ids; unknown endpoints, self-loops and
      duplicates are dropped; strength is clamped to [0, 1]
    - cycles are broken by removing only the edges that close a cycle
    """
    clean: list[dict] = []
    id_map: dict[str, str] = {}
    by_name: dict[str, dict] = {}
    used: set[str] = set()

    for raw in concepts if isinstance(concepts, list) else []:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        definition = str(raw.get("definition") or "").strip()
        if not name or len(definition) < 3:
            continue
        raw_id = str(raw.get("id") or name)
        name_key = normalize_name(name) or name.lower()
        timestamp = int(_clean_float(raw.get("timestamp_seconds"), 0, 0, 10**7))

        existing = by_name.get(name_key)
        if existing is not None:
            existing["timestamp_seconds"] = min(existing["timestamp_seconds"], timestamp)
            id_map[raw_id] = existing["id"]
            continue

        base = _slugify(raw_id) or _slugify(name) or "concept"
        candidate, n = base, 2
        while candidate in used:
            candidate, n = f"{base}_{n}", n + 1
        used.add(candidate)
        difficulty = str(raw.get("difficulty") or "").lower()
        concept = {
            "id": candidate,
            "name": name[:120],
            "definition": definition[:1000],
            "timestamp_seconds": timestamp,
            "difficulty": difficulty if difficulty in VALID_DIFFICULTIES else "intermediate",
        }
        clean.append(concept)
        by_name[name_key] = concept
        id_map[raw_id] = candidate

    remapped = []
    for edge in edges if isinstance(edges, list) else []:
        if not isinstance(edge, dict):
            continue
        a, b = id_map.get(edge.get("from")), id_map.get(edge.get("to"))
        if not a or not b or a == b:
            continue
        remapped.append({"from": a, "to": b, "strength": _clean_float(edge.get("strength"), 0.5, 0.0, 1.0)})

    # Strongest relationships are kept first when a cycle forces a choice.
    remapped.sort(key=lambda e: -e["strength"])
    kept, removed = break_cycles([c["id"] for c in clean], remapped)
    if removed:
        logger.warning("Removed %s invalid/cyclic prerequisite edges", len(removed))
    return clean, kept


def _split_transcript(transcript: str) -> list[str]:
    """Split on paragraph/sentence boundaries into chunks of at most CHUNK_CHARS."""
    if len(transcript) <= CHUNK_CHARS:
        return [transcript]
    pieces = re.split(r"(?<=[.!?\n])\s+", transcript)
    chunks, current = [], ""
    for piece in pieces:
        while len(piece) > CHUNK_CHARS:  # pathological unbroken text
            if current:
                chunks.append(current)
                current = ""
            chunks.append(piece[:CHUNK_CHARS])
            piece = piece[CHUNK_CHARS:]
        if len(current) + len(piece) + 1 > CHUNK_CHARS and current:
            chunks.append(current)
            current = piece
        else:
            current = f"{current} {piece}".strip()
    if current:
        chunks.append(current)
    return chunks


def _is_retryable(error: Exception) -> bool:
    return _classify_gemini_error(error)[1]


def _gemini_failure_message(error: Exception | None) -> str:
    """Turn an SDK error into a safe, actionable message (never includes the key)."""
    code, _, _ = _classify_gemini_error(error or RuntimeError())
    if code == "permanent_failure":
        return f"Gemini request failed: {type(error).__name__}"
    return _failure_message(code)


async def _generate_text(model, prompt: str, *, temperature: float, max_tokens: int) -> str:
    """Call Gemini with bounded jittered retries for transient failures only."""
    attempts = max(1, settings.GEMINI_MAX_ATTEMPTS)
    last_code = "permanent_failure"
    last_retryable = False
    last_retry_after = None
    for attempt in range(attempts):
        try:
            response = await asyncio.to_thread(
                _call_model,
                model,
                prompt,
                genai.GenerationConfig(temperature=temperature, max_output_tokens=max_tokens),
                active_gemini_key(),
            )
            return response.text
        except Exception as error:  # noqa: BLE001 - SDK raises many types
            code, retryable, retry_after = _classify_gemini_error(error)
            last_code = code
            last_retryable = retryable
            last_retry_after = retry_after
            if not retryable or attempt + 1 >= attempts:
                break
            cap = max(0.0, settings.GEMINI_RETRY_MAX_SECONDS)
            exponential = min(cap, max(0.0, settings.GEMINI_RETRY_BASE_SECONDS) * (2 ** attempt))
            delay = min(cap, max(random.uniform(0.0, exponential), retry_after or 0.0))
            logger.warning("Gemini call failed (%s); retry %s/%s in %.1fs", code, attempt + 1, attempts - 1, delay)
            await asyncio.sleep(delay)
    key = active_gemini_key()
    fingerprint = hashlib.sha256(key.encode()).hexdigest() if key else None
    message = _failure_message(last_code)
    if last_code == "quota_exhausted" and last_retry_after:
        message += f" Google suggests waiting about {int(last_retry_after)} seconds before retrying."
    raise GeminiRequestError(last_code, message, retryable=last_retryable, key_fingerprint=fingerprint,
                             retry_after=last_retry_after) from None


async def test_gemini_key() -> None:
    """Verify a key with a tiny fixed prompt that contains no user data."""
    model = _configure_gemini()
    await _generate_text(model, "Reply with OK.", temperature=0, max_tokens=8)


async def _extract_chunk(model, chunk: str) -> dict:
    prompt = EXTRACTION_PROMPT.format(transcript=chunk)
    text = await _generate_text(model, prompt, temperature=0.3, max_tokens=8192)
    try:
        data = _load_json_from_model_text(text)
    except Exception:
        # One repair attempt: malformed JSON is usually transient.
        text = await _generate_text(
            model, prompt + "\n\nReturn strictly valid JSON only.", temperature=0.1, max_tokens=8192
        )
        try:
            data = _load_json_from_model_text(text)
        except Exception as error:
            raise RuntimeError("Gemini returned invalid concept JSON") from error
    if not isinstance(data, dict):
        raise RuntimeError("Gemini concept response has an invalid shape")
    return data


async def extract_concepts_and_edges(transcript: str, lecture_id: str) -> dict:
    if not transcript.strip():
        raise RuntimeError("Transcript is empty")

    if not active_gemini_key():
        logger.info("Gemini is not configured; using local extractive concept fallback")
        return _local_concept_fallback(transcript)

    model = _configure_gemini()
    chunks = _split_transcript(transcript)
    if len(chunks) > MAX_CHUNKS:
        logger.info("Transcript has %s chunks; processing the first %s", len(chunks), MAX_CHUNKS)
        chunks = chunks[:MAX_CHUNKS]

    all_concepts: list = []
    all_edges: list = []
    for index, chunk in enumerate(chunks):
        data = await _extract_chunk(model, chunk)
        concepts = data.get("concepts", [])
        edges = data.get("edges", [])
        if not isinstance(concepts, list) or not isinstance(edges, list):
            raise RuntimeError("Gemini concept response has an invalid shape")
        # Ids are only unique per chunk; namespace them so chunks cannot collide,
        # then merge by concept name in normalize_graph.
        prefix = f"c{index}__" if len(chunks) > 1 else ""
        for concept in concepts:
            if isinstance(concept, dict):
                concept["id"] = prefix + str(concept.get("id") or concept.get("name") or "")
        for edge in edges:
            if isinstance(edge, dict):
                edge["from"] = prefix + str(edge.get("from"))
                edge["to"] = prefix + str(edge.get("to"))
        all_concepts.extend(concepts)
        all_edges.extend(edges)

    concepts, edges = normalize_graph(all_concepts, all_edges)
    if not concepts:
        raise RuntimeError("Gemini extracted no concepts")

    logger.info("Extracted %s concepts and %s edges", len(concepts), len(edges))
    return {"concepts": concepts, "edges": edges, "source": "gemini"}


def _fallback_cards(concept_name: str, definition: str) -> list:
    return [{
        "question": f"What does {concept_name} mean in this lecture?",
        "answer": definition or f"{concept_name} is a key idea from this lecture.",
    }]


def _clean_cards(cards) -> list:
    if not isinstance(cards, list):
        return []
    cleaned = []
    for card in cards:
        if isinstance(card, dict):
            q, a = str(card.get("question") or "").strip(), str(card.get("answer") or "").strip()
            if q and a:
                cleaned.append({"question": q, "answer": a})
    return cleaned[:3]


async def generate_flashcards_for_concept(
    concept_name: str,
    definition: str,
    context: str = "",
) -> list:
    model = _configure_gemini()
    prompt = FLASHCARD_PROMPT.format(
        concept_name=concept_name,
        definition=definition,
        context=context[:2000] if context else "",
    )
    text = await _generate_text(model, prompt, temperature=0.4, max_tokens=1024)
    cards = _clean_cards(_load_json_from_model_text(text))
    if cards:
        return cards
    raise GeminiRequestError("invalid_response", "Gemini returned no usable flashcards.")
