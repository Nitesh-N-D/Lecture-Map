import pytest

from app.services import graph_algorithms as algo


def e(a, b):
    return {"from": a, "to": b}


IDS = ["a", "b", "c", "d"]
EDGES = [e("a", "b"), e("b", "c"), e("a", "d")]


def test_topological_order_respects_edges():
    order = algo.topological_order(IDS, EDGES)
    assert order.index("a") < order.index("b") < order.index("c")
    assert order.index("a") < order.index("d")


def test_topological_order_empty_graph():
    assert algo.topological_order([], []) == []


def test_topological_order_raises_on_cycle():
    with pytest.raises(algo.CycleError):
        algo.topological_order(["a", "b"], [e("a", "b"), e("b", "a")])


def test_break_cycles_removes_only_closing_edge():
    kept, removed = algo.break_cycles(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("c", "a")])
    assert kept == [e("a", "b"), e("b", "c")]
    assert removed == [e("c", "a")]
    assert algo.is_dag(["a", "b", "c"], kept)


def test_break_cycles_drops_self_loops_unknown_and_duplicates():
    kept, removed = algo.break_cycles(["a", "b"], [e("a", "a"), e("a", "x"), e("a", "b"), e("a", "b")])
    assert kept == [e("a", "b")]
    assert len(removed) == 2


def test_study_path_is_prerequisite_first_and_excludes_target():
    assert algo.study_path("c", IDS, EDGES) == ["a", "b"]
    assert algo.study_path("a", IDS, EDGES) == []


def test_study_path_unknown_target():
    with pytest.raises(KeyError):
        algo.study_path("zzz", IDS, EDGES)


def test_knowledge_gaps_only_unstudied_prerequisites_of_studied_concepts():
    assert algo.knowledge_gaps(IDS, EDGES, {"c"}) == ["a", "b"]
    assert algo.knowledge_gaps(IDS, EDGES, {"c", "a"}) == ["b"]
    assert algo.knowledge_gaps(IDS, EDGES, set()) == []
    assert algo.knowledge_gaps(IDS, EDGES, {"a"}) == []  # unrelated unvisited nodes are not gaps
    assert algo.knowledge_gaps(IDS, EDGES, {"ghost"}) == []


def test_link_across_lectures_is_conservative():
    nodes = [
        {"concept_id": "1:x", "name": "The Chain Rule", "lecture_id": "1"},
        {"concept_id": "2:y", "name": "chain rule!", "lecture_id": "2"},
        {"concept_id": "2:z", "name": "Chain Rule Applications", "lecture_id": "2"},
        {"concept_id": "1:w", "name": "chain rule", "lecture_id": "1"},
    ]
    bridges = algo.link_across_lectures(nodes)
    pairs = {frozenset((b["from"], b["to"])) for b in bridges}  # links are undirected
    assert frozenset(("1:x", "2:y")) in pairs and frozenset(("1:w", "2:y")) in pairs
    assert not any("2:z" in tuple(p) for p in pairs)           # partial matches never bridge
    assert frozenset(("1:x", "1:w")) not in pairs                  # same-lecture duplicates never bridge


def test_concept_statuses():
    ids, edges = ["a", "b", "c"], [e("a", "b"), e("b", "c")]
    assert algo.concept_statuses(ids, edges, set(), set()) == {"a": "unexplored", "b": "blocked", "c": "blocked"}
    assert algo.concept_statuses(ids, edges, {"a"}, set()) == {"a": "studied", "b": "unexplored", "c": "blocked"}
    assert algo.concept_statuses(ids, edges, {"a"}, {"b"}) == {"a": "studied", "b": "mastered", "c": "unexplored"}
    # mastery implies done; studied takes precedence over blocked
    assert algo.concept_statuses(ids, edges, {"c"}, set())["c"] == "studied"
