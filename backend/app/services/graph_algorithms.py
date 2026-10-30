"""Pure graph algorithms for the prerequisite DAG.

These operate on the portable snapshot format used by the API
(``{"nodes": [{"concept_id": ...}], "edges": [{"from": prereq, "to": dependent}]}``)
so the study experience works identically with or without Neo4j.
"""
import re
from collections import defaultdict, deque
from typing import Iterable


class CycleError(ValueError):
    """Raised when an operation requires a DAG but the graph has a cycle."""


def _adjacency(ids: Iterable[str], edges: list[dict]):
    ids = list(ids)
    known = set(ids)
    succ: dict[str, list[str]] = {i: [] for i in ids}
    pred: dict[str, list[str]] = {i: [] for i in ids}
    for edge in edges:
        a, b = edge.get("from"), edge.get("to")
        if a in known and b in known and a != b and b not in succ[a]:
            succ[a].append(b)
            pred[b].append(a)
    return succ, pred


def break_cycles(ids: list[str], edges: list[dict]) -> tuple[list[dict], list[dict]]:
    """Return ``(kept_edges, removed_edges)`` where kept edges form a DAG.

    Only the edges that close a cycle (DFS back edges) are removed; every other
    prerequisite relationship is preserved. Edge order is respected, so earlier
    (usually more confident) edges win ties deterministically.
    """
    kept: list[dict] = []
    removed: list[dict] = []
    succ: dict[str, set[str]] = defaultdict(set)

    def reaches(src: str, dst: str) -> bool:
        stack, seen = [src], {src}
        while stack:
            node = stack.pop()
            if node == dst:
                return True
            for nxt in succ[node]:
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return False

    known = set(ids)
    for edge in edges:
        a, b = edge.get("from"), edge.get("to")
        if a not in known or b not in known or a == b:
            removed.append(edge)
            continue
        if b in succ[a]:  # duplicate edge
            continue
        if reaches(b, a):  # adding a->b would close a cycle
            removed.append(edge)
            continue
        succ[a].add(b)
        kept.append(edge)
    return kept, removed


def topological_order(ids: list[str], edges: list[dict]) -> list[str]:
    """Stable Kahn topological sort (ties broken by input order).

    Raises ``CycleError`` for cyclic graphs; empty graphs return ``[]``.
    """
    succ, pred = _adjacency(ids, edges)
    indeg = {i: len(pred[i]) for i in succ}
    position = {i: n for n, i in enumerate(ids)}
    ready = deque(sorted((i for i, d in indeg.items() if d == 0), key=position.get))
    order: list[str] = []
    while ready:
        node = ready.popleft()
        order.append(node)
        released = []
        for nxt in succ[node]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                released.append(nxt)
        for nxt in sorted(released, key=position.get):
            ready.append(nxt)
    if len(order) != len(succ):
        raise CycleError("Graph contains a cycle")
    return order


def is_dag(ids: list[str], edges: list[dict]) -> bool:
    try:
        topological_order(ids, edges)
        return True
    except CycleError:
        return False


def transitive_prerequisites(target: str, ids: list[str], edges: list[dict]) -> set[str]:
    """All concepts that must be understood (directly or indirectly) before ``target``."""
    _, pred = _adjacency(ids, edges)
    if target not in pred:
        return set()
    seen: set[str] = set()
    stack = list(pred[target])
    while stack:
        node = stack.pop()
        if node in seen or node == target:
            continue
        seen.add(node)
        stack.extend(pred[node])
    return seen


def study_path(target: str, ids: list[str], edges: list[dict]) -> list[str]:
    """Prerequisites of ``target`` in prerequisite-first order (target excluded).

    Raises ``KeyError`` for an unknown target and ``CycleError`` for cyclic graphs.
    """
    if target not in set(ids):
        raise KeyError(target)
    needed = transitive_prerequisites(target, ids, edges)
    order = topological_order(ids, edges)
    return [node for node in order if node in needed]


def knowledge_gaps(ids: list[str], edges: list[dict], visited: set[str]) -> list[str]:
    """Unstudied foundations of concepts the learner *has* studied.

    A concept is a gap when it is not studied and is a (transitive) prerequisite
    of at least one studied concept. Unrelated unvisited concepts are never gaps.
    """
    known = set(ids)
    visited = {v for v in visited if v in known}
    gaps: set[str] = set()
    for node in visited:
        gaps |= transitive_prerequisites(node, ids, edges)
    gaps -= visited
    position = {i: n for n, i in enumerate(ids)}
    return sorted(gaps, key=position.get)


# ── Cross-lecture linking ────────────────────────────────────────────────────

_STOP = {"the", "a", "an", "of", "and", "in", "to", "for"}


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation/articles and collapse whitespace."""
    words = re.findall(r"[a-z0-9]+", (name or "").lower())
    return " ".join(w for w in words if w not in _STOP)


def link_across_lectures(nodes: list[dict]) -> list[dict]:
    """Conservative bridges between concepts of *different* lectures.

    Two concepts are bridged only when their normalised names are identical and
    non-empty. Nodes are never merged; each keeps its own identity and the bridge
    is an explicit relationship (``{"from", "to", "type": "same_concept"}``).
    """
    by_name: dict[str, list[dict]] = defaultdict(list)
    for node in nodes:
        key = normalize_name(node.get("name", ""))
        if key:
            by_name[key].append(node)
    bridges = []
    for key, group in by_name.items():
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a.get("lecture_id") != b.get("lecture_id"):
                    bridges.append({"from": a["concept_id"], "to": b["concept_id"], "type": "same_concept"})
    return bridges


# ── Learner progress ─────────────────────────────────────────────────────────

MASTERY_MIN_REPETITIONS = 2  # consecutive successful reviews required on every card of a concept


def concept_statuses(ids: list[str], edges: list[dict], studied: set[str], mastered: set[str]) -> dict[str, str]:
    """Learning status per concept: ``mastered`` | ``studied`` | ``blocked`` | ``unexplored``.

    * mastered  – earned through spaced-repetition reviews (never by viewing a node)
    * studied   – the learner explicitly marked it studied
    * blocked   – not started, and at least one direct prerequisite is neither studied nor mastered
    * unexplored – not started, with all prerequisites (if any) at least studied
    """
    _, pred = _adjacency(ids, edges)
    done = studied | mastered
    out: dict[str, str] = {}
    for node in ids:
        if node in mastered:
            out[node] = "mastered"
        elif node in studied:
            out[node] = "studied"
        elif any(p not in done for p in pred[node]):
            out[node] = "blocked"
        else:
            out[node] = "unexplored"
    return out
