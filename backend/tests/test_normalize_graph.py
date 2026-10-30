from app.services.concept_extraction import normalize_graph
from app.services.graph_algorithms import is_dag


def concept(id_, name, definition="A definition."):
    return {"id": id_, "name": name, "definition": definition}


def test_drops_invalid_concepts_and_merges_duplicate_names():
    concepts, edges = normalize_graph(
        [concept("a", "Limits"), concept("b", "limits"), {"id": "c", "name": "", "definition": "x"}, "junk",
         concept("d", "Derivatives", "")],
        [],
    )
    assert [c["name"] for c in concepts] == ["Limits"]


def test_remaps_edges_and_removes_cycles_and_bad_edges():
    concepts, edges = normalize_graph(
        [concept("a", "A"), concept("b", "B"), concept("c", "C")],
        [
            {"from": "a", "to": "b", "strength": 5},
            {"from": "b", "to": "c", "strength": 0.9},
            {"from": "c", "to": "a", "strength": 0.1},
            {"from": "a", "to": "ghost"},
            {"from": "a", "to": "a"},
        ],
    )
    ids = [c["id"] for c in concepts]
    assert is_dag(ids, edges)
    assert all(0 <= x["strength"] <= 1 for x in edges)
    assert len(edges) == 2


def test_handles_non_list_input():
    assert normalize_graph(None, None) == ([], [])
