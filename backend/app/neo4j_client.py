from neo4j import AsyncGraphDatabase
from app.config import settings
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class Neo4jClient:
    def __init__(self):
        self._driver = None

    async def connect(self):
        if not settings.NEO4J_URI:
            logger.warning("NEO4J_URI not set — graph features disabled")
            return
        self._driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
        )
        await self._driver.verify_connectivity()
        logger.info("Neo4j connected")

    async def close(self):
        if self._driver:
            await self._driver.close()

    @property
    def driver(self):
        return self._driver

    # ─── Node CRUD ──────────────────────────────────────────────────────────

    async def create_concept_node(
        self,
        lecture_id: str,
        concept_id: str,
        name: str,
        definition: str,
        timestamp_seconds: int,
        difficulty: str = "intermediate",
        visit_count: int = 0,
    ) -> dict:
        if not self._driver:
            return {}
        async with self._driver.session() as session:
            result = await session.run(
                """
                MERGE (c:Concept {concept_id: $concept_id})
                SET c.lecture_id = $lecture_id,
                    c.name = $name,
                    c.definition = $definition,
                    c.timestamp_seconds = $timestamp_seconds,
                    c.difficulty = $difficulty,
                    c.visit_count = $visit_count,
                    c.updated_at = datetime()
                RETURN c
                """,
                concept_id=concept_id,
                lecture_id=lecture_id,
                name=name,
                definition=definition,
                timestamp_seconds=timestamp_seconds,
                difficulty=difficulty,
                visit_count=visit_count,
            )
            record = await result.single()
            return dict(record["c"]) if record else {}

    async def create_dependency_edge(
        self,
        from_id: str,
        to_id: str,
        lecture_id: str,
        strength: float,
    ) -> bool:
        if not self._driver:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MATCH (a:Concept {concept_id: $from_id})
                MATCH (b:Concept {concept_id: $to_id})
                MERGE (a)-[r:PREREQUISITE_OF {lecture_id: $lecture_id}]->(b)
                SET r.strength = $strength
                """,
                from_id=from_id,
                to_id=to_id,
                lecture_id=lecture_id,
                strength=strength,
            )
        return True

    async def get_graph(self, lecture_id: str) -> dict:
        if not self._driver:
            return {"nodes": [], "edges": []}
        async with self._driver.session() as session:
            nodes_result = await session.run(
                """
                MATCH (c:Concept {lecture_id: $lecture_id})
                RETURN c
                """,
                lecture_id=lecture_id,
            )
            nodes = []
            async for record in nodes_result:
                nodes.append(dict(record["c"]))

            edges_result = await session.run(
                """
                MATCH (a:Concept {lecture_id: $lecture_id})-[r:PREREQUISITE_OF]->(b:Concept {lecture_id: $lecture_id})
                RETURN a.concept_id AS from_id, b.concept_id AS to_id, r.strength AS strength
                """,
                lecture_id=lecture_id,
            )
            edges = []
            async for record in edges_result:
                edges.append({
                    "from": record["from_id"],
                    "to": record["to_id"],
                    "strength": record["strength"],
                })

        return {"nodes": nodes, "edges": edges}

    async def get_prerequisites(self, concept_id: str) -> list:
        if not self._driver:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (pre:Concept)-[:PREREQUISITE_OF]->(c:Concept {concept_id: $concept_id})
                RETURN pre
                """,
                concept_id=concept_id,
            )
            prereqs = []
            async for record in result:
                prereqs.append(dict(record["pre"]))
        return prereqs

    async def get_dependents(self, concept_id: str) -> list:
        if not self._driver:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (c:Concept {concept_id: $concept_id})-[:PREREQUISITE_OF]->(dep:Concept)
                RETURN dep
                """,
                concept_id=concept_id,
            )
            deps = []
            async for record in result:
                deps.append(dict(record["dep"]))
        return deps

    async def mark_visited(self, concept_id: str, user_id: str) -> bool:
        if not self._driver:
            return False
        async with self._driver.session() as session:
            await session.run(
                """
                MATCH (c:Concept {concept_id: $concept_id})
                MERGE (u:User {user_id: $user_id})
                MERGE (u)-[v:VISITED]->(c)
                SET v.visited_at = datetime(),
                    c.visit_count = coalesce(c.visit_count, 0) + 1
                """,
                concept_id=concept_id,
                user_id=user_id,
            )
        return True

    async def get_visited_concepts(self, lecture_id: str, user_id: str) -> list:
        if not self._driver:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (u:User {user_id: $user_id})-[:VISITED]->(c:Concept {lecture_id: $lecture_id})
                RETURN c.concept_id AS concept_id
                """,
                user_id=user_id,
                lecture_id=lecture_id,
            )
            visited = []
            async for record in result:
                visited.append(record["concept_id"])
        return visited

    async def is_concept_visited(self, concept_id: str, user_id: str) -> bool:
        """
        Check visited status for a single concept regardless of which
        lecture it belongs to. Used by the concept-detail endpoint, which
        only has a concept_id (not a lecture_id) to work with.
        """
        if not self._driver:
            return False
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (u:User {user_id: $user_id})-[:VISITED]->(c:Concept {concept_id: $concept_id})
                RETURN c LIMIT 1
                """,
                user_id=user_id,
                concept_id=concept_id,
            )
            record = await result.single()
            return record is not None

    async def get_gap_nodes(self, lecture_id: str, user_id: str) -> list:
        """Return prerequisite nodes that are unvisited but whose dependents are visited."""
        if not self._driver:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (u:User {user_id: $user_id})-[:VISITED]->(visited:Concept {lecture_id: $lecture_id})
                MATCH (gap:Concept {lecture_id: $lecture_id})-[:PREREQUISITE_OF]->(visited)
                WHERE NOT (u)-[:VISITED]->(gap)
                RETURN DISTINCT gap
                """,
                user_id=user_id,
                lecture_id=lecture_id,
            )
            gaps = []
            async for record in result:
                gaps.append(dict(record["gap"]))
        return gaps

    async def find_study_path(self, target_concept_id: str, user_id: str) -> list:
        """Find ordered study path from unvisited prerequisites to target concept."""
        if not self._driver:
            return []
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH path = (pre:Concept)-[:PREREQUISITE_OF*]->(target:Concept {concept_id: $target_concept_id})
                WHERE NOT (pre)-[:PREREQUISITE_OF*]->(pre)
                WITH pre, length(path) AS depth
                ORDER BY depth DESC
                RETURN DISTINCT pre
                """,
                target_concept_id=target_concept_id,
                user_id=user_id,
            )
            path_nodes = []
            async for record in result:
                path_nodes.append(dict(record["pre"]))
        return path_nodes

    async def merge_lecture_graphs(self, lecture_ids: list) -> int:
        """Cross-link concepts with identical names across lectures."""
        if not self._driver or len(lecture_ids) < 2:
            return 0
        merged = 0
        async with self._driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Concept)
                WHERE a.lecture_id IN $lecture_ids
                MATCH (b:Concept)
                WHERE b.lecture_id IN $lecture_ids AND a.lecture_id <> b.lecture_id
                  AND toLower(a.name) = toLower(b.name)
                MERGE (a)-[r:SAME_CONCEPT]->(b)
                RETURN count(r) AS merged_count
                """,
                lecture_ids=lecture_ids,
            )
            record = await result.single()
            merged = record["merged_count"] if record else 0
        return merged

    async def get_merged_graph(self, lecture_ids: list, lecture_titles: dict = None) -> dict:
        """
        Build a unified cross-lecture knowledge map: all concept nodes from
        the given lectures, all PREREQUISITE_OF edges within each lecture,
        plus SAME_CONCEPT bridge edges linking identical concepts across
        different lectures (run merge_lecture_graphs first to populate
        those bridges). Each node is annotated with lecture_title for
        grouping/coloring on the frontend.
        """
        if not self._driver or not lecture_ids:
            return {"nodes": [], "edges": [], "bridges": []}

        lecture_titles = lecture_titles or {}

        async with self._driver.session() as session:
            nodes_result = await session.run(
                """
                MATCH (c:Concept)
                WHERE c.lecture_id IN $lecture_ids
                RETURN c
                """,
                lecture_ids=lecture_ids,
            )
            nodes = []
            async for record in nodes_result:
                n = dict(record["c"])
                n["lecture_title"] = lecture_titles.get(n.get("lecture_id"), "")
                nodes.append(n)

            edges_result = await session.run(
                """
                MATCH (a:Concept)-[r:PREREQUISITE_OF]->(b:Concept)
                WHERE a.lecture_id IN $lecture_ids AND b.lecture_id IN $lecture_ids
                RETURN a.concept_id AS from_id, b.concept_id AS to_id, r.strength AS strength
                """,
                lecture_ids=lecture_ids,
            )
            edges = []
            async for record in edges_result:
                edges.append({
                    "from": record["from_id"],
                    "to": record["to_id"],
                    "strength": record["strength"],
                })

            bridges_result = await session.run(
                """
                MATCH (a:Concept)-[:SAME_CONCEPT]->(b:Concept)
                WHERE a.lecture_id IN $lecture_ids AND b.lecture_id IN $lecture_ids
                RETURN DISTINCT a.concept_id AS from_id, b.concept_id AS to_id
                """,
                lecture_ids=lecture_ids,
            )
            bridges = []
            async for record in bridges_result:
                bridges.append({"from": record["from_id"], "to": record["to_id"]})

        return {"nodes": nodes, "edges": edges, "bridges": bridges}

    async def delete_lecture_graph(self, lecture_id: str):
        if not self._driver:
            return
        async with self._driver.session() as session:
            await session.run(
                """
                MATCH (c:Concept {lecture_id: $lecture_id})
                DETACH DELETE c
                """,
                lecture_id=lecture_id,
            )


neo4j_client = Neo4jClient()