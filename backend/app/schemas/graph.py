from pydantic import BaseModel
from typing import Optional, List


class ConceptNode(BaseModel):
    concept_id: str
    name: str
    definition: str
    timestamp_seconds: int
    difficulty: str = "intermediate"
    visit_count: int = 0
    lecture_id: str


class ConceptEdge(BaseModel):
    source: str  # from concept_id
    target: str  # to concept_id
    strength: float


class GraphResponse(BaseModel):
    nodes: List[ConceptNode]
    edges: List[ConceptEdge]
    stats: dict


class ConceptDetail(BaseModel):
    concept: ConceptNode
    prerequisites: List[ConceptNode]
    dependents: List[ConceptNode]
    is_visited: bool = False


class StudyPathResponse(BaseModel):
    path: List[ConceptNode]
    target: ConceptNode
    total_steps: int


class GapResponse(BaseModel):
    gaps: List[ConceptNode]
    total_gaps: int
