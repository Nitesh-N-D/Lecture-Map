import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.flashcard import Flashcard
from app.models.lecture import Lecture, LectureStatus
from app.models.user import User
from app.neo4j_client import neo4j_client
from app.services import graph_algorithms as algo
from app.services.graph_service import get_graph_with_stats, graph_from_lecture

logger = logging.getLogger(__name__)
router = APIRouter(tags=["graph"])


async def _owned_lecture(db: AsyncSession, lecture_id: str, user: User) -> Lecture:
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")
    return lecture


def _visited(lecture: Lecture) -> set[str]:
    try:
        return set(json.loads(lecture.visited_concept_ids or "[]"))
    except (TypeError, json.JSONDecodeError):
        return set()


async def _mastered(db: AsyncSession, lecture_ids: list[str]) -> dict[str, set[str]]:
    """Concepts whose every flashcard has enough consecutive successful reviews."""
    out: dict[str, set[str]] = {lid: set() for lid in lecture_ids}
    if not lecture_ids:
        return out
    rows = await db.execute(
        select(Flashcard.lecture_id, Flashcard.concept_id)
        .where(Flashcard.lecture_id.in_(lecture_ids))
        .group_by(Flashcard.lecture_id, Flashcard.concept_id)
        .having(func.min(Flashcard.repetitions) >= algo.MASTERY_MIN_REPETITIONS)
    )
    for lecture_id, concept_id in rows.all():
        out[lecture_id].add(concept_id)
    return out


def _annotate(graph: dict, studied: set[str], mastered: set[str]) -> None:
    """Add ``status`` and ``is_visited`` (= studied or mastered) to every node, in place."""
    ids, edges = _ids_edges(graph)
    statuses = algo.concept_statuses(ids, edges, studied, mastered)
    for node in graph["nodes"]:
        status = statuses[node["concept_id"]]
        node["status"] = status
        node["is_visited"] = status in ("studied", "mastered")
    counts = {k: 0 for k in ("unexplored", "studied", "mastered", "blocked")}
    for status in statuses.values():
        counts[status] += 1
    graph.setdefault("stats", {})["status_breakdown"] = counts


def _with_stats(graph: dict) -> dict:
    nodes, edges = graph["nodes"], graph["edges"]
    breakdown = {"beginner": 0, "intermediate": 0, "advanced": 0}
    for node in nodes:
        d = node.get("difficulty", "intermediate")
        breakdown[d] = breakdown.get(d, 0) + 1
    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "difficulty_breakdown": breakdown,
            "avg_connections": round(len(edges) / max(len(nodes), 1), 2),
        },
    }


async def _load_graph(lecture: Lecture) -> dict:
    """The persisted snapshot is the source of truth; Neo4j only serves legacy
    lectures that were stored before snapshots existed."""
    if lecture.graph_data:
        return _with_stats(graph_from_lecture(lecture))
    if neo4j_client.driver:
        return await get_graph_with_stats(lecture.id)
    return _with_stats({"nodes": [], "edges": []})


def _ids_edges(graph: dict) -> tuple[list[str], list[dict]]:
    return [n["concept_id"] for n in graph["nodes"]], graph["edges"]


@router.get("/lectures/{lecture_id}/graph")
async def get_graph(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture = await _owned_lecture(db, lecture_id, current_user)
    graph = await _load_graph(lecture)
    mastered = (await _mastered(db, [lecture.id]))[lecture.id]
    _annotate(graph, _visited(lecture), mastered)
    return graph


@router.get("/lectures/{lecture_id}/graph/gaps")
async def get_graph_gaps(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unstudied foundations of concepts the learner has already studied."""
    lecture = await _owned_lecture(db, lecture_id, current_user)
    graph = await _load_graph(lecture)
    ids, edges = _ids_edges(graph)
    mastered = (await _mastered(db, [lecture.id]))[lecture.id]
    gap_ids = algo.knowledge_gaps(ids, edges, _visited(lecture) | mastered)
    by_id = {n["concept_id"]: n for n in graph["nodes"]}
    gaps = [{**by_id[g], "is_visited": False} for g in gap_ids]
    return {"gaps": gaps, "total_gaps": len(gaps)}


@router.get("/concepts/{concept_id}")
async def get_concept(
    concept_id: str,
    lecture_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture = await _owned_lecture(db, lecture_id, current_user)
    graph = await _load_graph(lecture)
    by_id = {n["concept_id"]: n for n in graph["nodes"]}
    if concept_id not in by_id:
        raise HTTPException(404, "Concept not found")
    mastered = (await _mastered(db, [lecture.id]))[lecture.id]
    _annotate(graph, _visited(lecture), mastered)
    by_id = {n["concept_id"]: n for n in graph["nodes"]}
    prerequisites = [by_id[e["from"]] for e in graph["edges"] if e["to"] == concept_id and e["from"] in by_id]
    dependents = [by_id[e["to"]] for e in graph["edges"] if e["from"] == concept_id and e["to"] in by_id]
    return {
        "concept_id": concept_id,
        "prerequisites": prerequisites,
        "dependents": dependents,
        "is_visited": by_id[concept_id]["is_visited"],
        "status": by_id[concept_id]["status"],
    }


@router.post("/concepts/{concept_id}/visit")
async def mark_visited(
    concept_id: str,
    lecture_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture = await _owned_lecture(db, lecture_id, current_user)
    graph = await _load_graph(lecture)
    if concept_id not in {n["concept_id"] for n in graph["nodes"]}:
        raise HTTPException(404, "Concept not found")
    visited = _visited(lecture)
    visited.add(concept_id)
    lecture.visited_concept_ids = json.dumps(sorted(visited))
    await db.commit()
    if neo4j_client.driver:  # best-effort mirror; the lecture row is authoritative
        try:
            await neo4j_client.mark_visited(concept_id, current_user.id)
        except Exception as error:
            logger.warning("Neo4j visit mirror failed: %s", type(error).__name__)
    return {"success": True, "concept_id": concept_id}


@router.delete("/concepts/{concept_id}/visit")
async def unmark_visited(
    concept_id: str,
    lecture_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lecture = await _owned_lecture(db, lecture_id, current_user)
    visited = _visited(lecture)
    visited.discard(concept_id)
    lecture.visited_concept_ids = json.dumps(sorted(visited))
    await db.commit()
    return {"success": True, "concept_id": concept_id}


@router.get("/lectures/{lecture_id}/study-path")
async def get_study_path(
    lecture_id: str,
    target: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Prerequisites of ``target`` in prerequisite-first (topological) order."""
    lecture = await _owned_lecture(db, lecture_id, current_user)
    graph = await _load_graph(lecture)
    ids, edges = _ids_edges(graph)
    try:
        ordered = algo.study_path(target, ids, edges)
    except KeyError:
        raise HTTPException(404, "Concept not found")
    except algo.CycleError:
        raise HTTPException(422, "This lecture's graph contains a cycle and has no valid study order")
    mastered = (await _mastered(db, [lecture.id]))[lecture.id]
    _annotate(graph, _visited(lecture), mastered)
    by_id = {n["concept_id"]: n for n in graph["nodes"]}
    path = [by_id[c] for c in ordered]
    remaining = [n for n in path if not n["is_visited"]]
    return {
        "path": path,
        "target": by_id[target],
        "target_concept_id": target,
        "total_steps": len(path),
        "remaining_steps": len(remaining),
        # First unfinished prerequisite. Its own prerequisites come earlier in the
        # path, so when it is the first unfinished item it is always ready to study.
        "next_concept": remaining[0] if remaining else None,
    }


@router.get("/knowledge-map")
async def get_knowledge_map(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merged map of the user's completed lectures.

    Every concept keeps its own identity and lecture. Cross-lecture links are
    explicit ``bridges`` between concepts whose normalised names are identical.
    """
    result = await db.execute(
        select(Lecture)
        .where(Lecture.user_id == current_user.id, Lecture.status == LectureStatus.COMPLETED)
        .order_by(Lecture.created_at)
    )
    lectures = result.scalars().all()
    if not lectures:
        return {"nodes": [], "edges": [], "bridges": [], "lecture_count": 0, "lectures": []}

    mastered_by_lecture = await _mastered(db, [l.id for l in lectures])
    nodes: list[dict] = []
    edges: list[dict] = []
    for lecture in lectures:
        graph = graph_from_lecture(lecture)
        _annotate(graph, _visited(lecture), mastered_by_lecture[lecture.id])
        title = lecture.title or "Untitled lecture"
        for node in graph["nodes"]:
            nodes.append({**node, "lecture_id": lecture.id, "lecture_title": title})
        edges.extend(graph["edges"])

    return {
        "nodes": nodes,
        "edges": edges,
        "bridges": algo.link_across_lectures(nodes),
        "lecture_count": len(lectures),
        "lectures": [{"id": l.id, "title": l.title or "Untitled lecture"} for l in lectures],
    }


@router.get("/progress/summary")
async def get_progress_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Learning progress across the user's processed lectures, from persisted data only."""
    rows = (await db.execute(
        select(Lecture)
        .where(Lecture.user_id == current_user.id, Lecture.status == LectureStatus.COMPLETED)
        .order_by(Lecture.updated_at.desc())
    )).scalars().all()
    mastered_by = await _mastered(db, [lec.id for lec in rows])
    totals = {k: 0 for k in ("concepts", "unexplored", "studied", "mastered", "blocked")}
    lectures = []
    for lec in rows:
        graph = graph_from_lecture(lec) if lec.graph_data else {"nodes": [], "edges": []}
        ids, edges = _ids_edges(graph)
        statuses = algo.concept_statuses(ids, edges, _visited(lec), mastered_by[lec.id])
        counts = {k: 0 for k in ("unexplored", "studied", "mastered", "blocked")}
        for status in statuses.values():
            counts[status] += 1
        total = len(ids)
        done = counts["studied"] + counts["mastered"]
        lectures.append({
            "lecture_id": lec.id, "title": lec.title, "concepts": total, **counts,
            "completed": done, "percent": round(100 * done / total) if total else 0,
            "updated_at": lec.updated_at.isoformat() if lec.updated_at else None,
        })
        totals["concepts"] += total
        for k, v in counts.items():
            totals[k] += v
    completed = totals["studied"] + totals["mastered"]
    # The lecture with the most recent activity that still has unfinished concepts.
    current = next((l for l in lectures if 0 < l["completed"] < l["concepts"]), None) or \
        next((l for l in lectures if l["completed"] < l["concepts"]), None)
    return {
        "total_concepts": totals["concepts"],
        "completed_concepts": completed,
        "mastered_concepts": totals["mastered"],
        "pending_concepts": totals["concepts"] - completed,
        "blocked_concepts": totals["blocked"],
        "percent": round(100 * completed / totals["concepts"]) if totals["concepts"] else 0,
        "lectures": lectures,
        "current_lecture_id": current["lecture_id"] if current else None,
    }
