import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.models.lecture import Lecture
from app.auth import get_current_user
from app.neo4j_client import neo4j_client
from app.services.graph_service import get_graph_with_stats

logger = logging.getLogger(__name__)
router = APIRouter(tags=["graph"])


@router.get("/lectures/{lecture_id}/graph")
async def get_graph(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    graph = await get_graph_with_stats(lecture_id)

    # Annotate visited nodes
    visited = await neo4j_client.get_visited_concepts(lecture_id, current_user.id)
    visited_set = set(visited)
    for node in graph["nodes"]:
        node["is_visited"] = node.get("concept_id") in visited_set

    return graph


@router.get("/lectures/{lecture_id}/graph/gaps")
async def get_graph_gaps(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    gaps = await neo4j_client.get_gap_nodes(lecture_id, current_user.id)
    return {"gaps": gaps, "total_gaps": len(gaps)}


@router.get("/concepts/{concept_id}")
async def get_concept(
    concept_id: str,
    current_user: User = Depends(get_current_user),
):
    prereqs = await neo4j_client.get_prerequisites(concept_id)
    dependents = await neo4j_client.get_dependents(concept_id)
    is_visited = await neo4j_client.is_concept_visited(concept_id, current_user.id)

    return {
        "concept_id": concept_id,
        "prerequisites": prereqs,
        "dependents": dependents,
        "is_visited": is_visited,
    }


@router.post("/concepts/{concept_id}/visit")
async def mark_visited(
    concept_id: str,
    current_user: User = Depends(get_current_user),
):
    success = await neo4j_client.mark_visited(concept_id, current_user.id)
    return {"success": success, "concept_id": concept_id}


@router.get("/lectures/{lecture_id}/study-path")
async def get_study_path(
    lecture_id: str,
    target: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Lecture).where(Lecture.id == lecture_id, Lecture.user_id == current_user.id)
    )
    lecture = result.scalar_one_or_none()
    if not lecture:
        raise HTTPException(404, "Lecture not found")

    path = await neo4j_client.find_study_path(target, current_user.id)
    return {
        "path": path,
        "target_concept_id": target,
        "total_steps": len(path),
    }


@router.get("/knowledge-map")
async def get_knowledge_map(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Unified cross-lecture knowledge map: merges every COMPLETED lecture
    the user owns into a single graph, auto-linking identically named
    concepts across lectures (e.g. "Recursion" taught in two different
    courses becomes one bridged node-pair). This is the feature that
    lets a learner see their entire personal curriculum as one map
    instead of isolated per-lecture islands.
    """
    result = await db.execute(
        select(Lecture).where(
            Lecture.user_id == current_user.id,
            Lecture.status == "COMPLETED",
        )
    )
    lectures = result.scalars().all()
    lecture_ids = [l.id for l in lectures]
    lecture_titles = {l.id: (l.title or "Untitled lecture") for l in lectures}

    if not lecture_ids:
        return {"nodes": [], "edges": [], "bridges": [], "lecture_count": 0}

    if len(lecture_ids) >= 2:
        await neo4j_client.merge_lecture_graphs(lecture_ids)

    graph = await neo4j_client.get_merged_graph(lecture_ids, lecture_titles)

    visited_set = set()
    for lid in lecture_ids:
        visited_set.update(await neo4j_client.get_visited_concepts(lid, current_user.id))
    for node in graph["nodes"]:
        node["is_visited"] = node.get("concept_id") in visited_set

    return {
        **graph,
        "lecture_count": len(lecture_ids),
        "lectures": [{"id": l.id, "title": lecture_titles[l.id]} for l in lectures],
    }
