import json
import logging
import re

import google.generativeai as genai
from app.config import settings

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


def _configure_gemini():
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-1.5-flash")


def _load_json_from_model_text(raw_text: str):
    raw_text = raw_text.strip()
    raw_text = re.sub(r"^```json\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        match = re.search(r"(\{.*\}|\[.*\])", raw_text, re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(1))


def _validate_dag(concepts: list, edges: list) -> tuple[list, list]:
    concept_ids = {concept.get("id") for concept in concepts if concept.get("id")}
    valid_edges = [
        edge for edge in edges
        if edge.get("from") in concept_ids
        and edge.get("to") in concept_ids
        and edge.get("from") != edge.get("to")
    ]

    from collections import defaultdict, deque

    in_degree = defaultdict(int)
    adjacency = defaultdict(list)

    for edge in valid_edges:
        adjacency[edge["from"]].append(edge["to"])
        in_degree[edge["to"]] += 1

    queue = deque([concept_id for concept_id in concept_ids if in_degree[concept_id] == 0])
    topo_order = []

    while queue:
        node = queue.popleft()
        topo_order.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(topo_order) < len(concept_ids):
        keep = set(topo_order)
        valid_edges = [
            edge for edge in valid_edges
            if edge["from"] in keep and edge["to"] in keep
        ]
        logger.warning("Cycle detected in concept graph; pruned cyclic edges")

    return concepts, valid_edges


async def extract_concepts_and_edges(transcript: str, lecture_id: str) -> dict:
    if not transcript.strip():
        raise RuntimeError("Transcript is empty")

    model = _configure_gemini()

    max_chars = 80_000
    if len(transcript) > max_chars:
        logger.info("Truncating transcript from %s to %s chars", len(transcript), max_chars)
        transcript = transcript[:max_chars] + "\n[transcript truncated]"

    response = model.generate_content(
        EXTRACTION_PROMPT.format(transcript=transcript),
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            max_output_tokens=8192,
        ),
    )

    try:
        data = _load_json_from_model_text(response.text)
    except Exception as e:
        raise RuntimeError(f"Gemini returned invalid concept JSON: {e}") from e

    concepts = data.get("concepts", [])
    edges = data.get("edges", [])
    if not isinstance(concepts, list) or not isinstance(edges, list):
        raise RuntimeError("Gemini concept response has an invalid shape")

    concepts, edges = _validate_dag(concepts, edges)
    if not concepts:
        raise RuntimeError("Gemini extracted no concepts")

    logger.info("Extracted %s concepts and %s edges", len(concepts), len(edges))
    return {"concepts": concepts, "edges": edges}


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

    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.4,
                max_output_tokens=1024,
            ),
        )
        cards = _load_json_from_model_text(response.text)
        if not isinstance(cards, list):
            raise RuntimeError("Gemini flashcard response is not a JSON array")
        return cards
    except Exception as e:
        logger.error("Flashcard generation failed for %s: %s", concept_name, e)
        return [
            {
                "question": f"How does {concept_name} matter in this lecture?",
                "answer": definition or f"{concept_name} was identified as an important lecture concept.",
            }
        ]
