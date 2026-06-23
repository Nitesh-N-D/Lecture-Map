import json
import logging
import re
from typing import Optional

import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)


EXTRACTION_PROMPT = """You are an expert knowledge graph builder. Given this lecture transcript, extract:
1. Key concepts (15-30 concepts for a 1-hour lecture, fewer for shorter content)
2. Prerequisite dependency edges between concepts

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
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
- An edge from A → B means "you must understand A before B"
- strength is 0.0-1.0 (how strongly A is needed for B)
- timestamp_seconds: approximate second in lecture where concept is first introduced
- Extract REAL prerequisite relationships, not just topic associations
- Concepts should form a DAG (directed acyclic graph) — no cycles
- ids must be unique, snake_case, descriptive (e.g., "binary_search", "time_complexity")

Transcript:
{transcript}
"""

FLASHCARD_PROMPT = """You are an expert educator creating spaced-repetition flashcards.
Given a concept name, definition, and lecture context, generate exactly 2 high-quality Q&A flashcards.

Concept: {concept_name}
Definition: {definition}
Lecture context: {context}

Return ONLY valid JSON array (no markdown):
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
- No "What is..." questions — use "How does...", "Why does...", "What happens when..."
- Answers should be self-contained and precise
"""


def _configure_gemini():
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-1.5-flash")


def _validate_dag(concepts: list, edges: list) -> tuple[list, list]:
    """Validate that edges form a DAG — remove cycles if found."""
    concept_ids = {c["id"] for c in concepts}
    
    # Filter edges to only reference existing concepts
    valid_edges = [
        e for e in edges
        if e.get("from") in concept_ids and e.get("to") in concept_ids
        and e.get("from") != e.get("to")
    ]

    # Topological sort to detect cycles
    from collections import defaultdict, deque
    in_degree = defaultdict(int)
    adj = defaultdict(list)

    for e in valid_edges:
        adj[e["from"]].append(e["to"])
        in_degree[e["to"]] += 1

    queue = deque([cid for cid in concept_ids if in_degree[cid] == 0])
    topo_order = []

    while queue:
        node = queue.popleft()
        topo_order.append(node)
        for neighbor in adj[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(topo_order) < len(concept_ids):
        # Cycle detected — remove back edges
        visited_set = set(topo_order)
        acyclic_edges = []
        for e in valid_edges:
            if e["from"] in visited_set and e["to"] in visited_set:
                acyclic_edges.append(e)
        logger.warning("Cycle detected in concept graph — pruned back edges")
        return concepts, acyclic_edges

    return concepts, valid_edges


async def extract_concepts_and_edges(transcript: str, lecture_id: str) -> dict:
    """
    Use Gemini Flash to extract concepts + edges from transcript.
    Returns validated GraphData dict.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — returning empty graph")
        return {"concepts": [], "edges": []}

    model = _configure_gemini()

    # Truncate very long transcripts to fit context window (~30k tokens safe)
    max_chars = 80_000
    if len(transcript) > max_chars:
        logger.info(f"Truncating transcript from {len(transcript)} to {max_chars} chars")
        transcript = transcript[:max_chars] + "\n[transcript truncated]"

    prompt = EXTRACTION_PROMPT.format(transcript=transcript)

    logger.info("Calling Gemini Flash for concept extraction...")
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.3,
            max_output_tokens=8192,
        ),
    )

    raw_text = response.text.strip()

    # Strip markdown code fences if present
    raw_text = re.sub(r"^```json\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        logger.error(f"Gemini returned invalid JSON: {e}\nRaw: {raw_text[:500]}")
        # Attempt partial extraction
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group())
            except Exception:
                return {"concepts": [], "edges": []}
        else:
            return {"concepts": [], "edges": []}

    concepts = data.get("concepts", [])
    edges = data.get("edges", [])

    # Validate DAG
    concepts, edges = _validate_dag(concepts, edges)

    logger.info(f"Extracted {len(concepts)} concepts and {len(edges)} edges")
    return {"concepts": concepts, "edges": edges}


async def generate_flashcards_for_concept(
    concept_name: str,
    definition: str,
    context: str = "",
) -> list:
    """Generate Q&A flashcard pairs for a concept using Gemini Flash."""
    if not settings.GEMINI_API_KEY:
        return []

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
        raw_text = response.text.strip()
        raw_text = re.sub(r"^```json\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
        cards = json.loads(raw_text)
        return cards if isinstance(cards, list) else []
    except Exception as e:
        logger.error(f"Flashcard generation failed for '{concept_name}': {e}")
        # Return a fallback card
        return [
            {
                "question": f"What is {concept_name} and why is it important?",
                "answer": definition,
            }
        ]
