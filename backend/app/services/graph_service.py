import logging
from typing import List, Optional
from app.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)


async def store_graph(lecture_id: str, graph_data: dict) -> tuple[int, int]:
    """Store concepts and edges in Neo4j. Returns (node_count, edge_count)."""
    concepts = graph_data.get("concepts", [])
    edges = graph_data.get("edges", [])

    for concept in concepts:
        await neo4j_client.create_concept_node(
            lecture_id=lecture_id,
            concept_id=concept["id"],
            name=concept["name"],
            definition=concept["definition"],
            timestamp_seconds=concept.get("timestamp_seconds", 0),
            difficulty=concept.get("difficulty", "intermediate"),
        )

    for edge in edges:
        await neo4j_client.create_dependency_edge(
            from_id=edge["from"],
            to_id=edge["to"],
            lecture_id=lecture_id,
            strength=float(edge.get("strength", 0.5)),
        )

    logger.info(f"Stored {len(concepts)} nodes and {len(edges)} edges for lecture {lecture_id}")
    return len(concepts), len(edges)


async def get_graph_with_stats(lecture_id: str) -> dict:
    """Get graph data plus computed statistics."""
    graph = await neo4j_client.get_graph(lecture_id)
    nodes = graph["nodes"]
    edges = graph["edges"]

    difficulty_counts = {"beginner": 0, "intermediate": 0, "advanced": 0}
    for node in nodes:
        d = node.get("difficulty", "intermediate")
        difficulty_counts[d] = difficulty_counts.get(d, 0) + 1

    stats = {
        "total_nodes": len(nodes),
        "total_edges": len(edges),
        "difficulty_breakdown": difficulty_counts,
        "avg_connections": round(len(edges) / max(len(nodes), 1), 2),
    }

    return {"nodes": nodes, "edges": edges, "stats": stats}
