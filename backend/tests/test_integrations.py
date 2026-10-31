"""Neo4j, Redis/Celery and background-task behaviour with test doubles (no network)."""
import asyncio
import ssl

import pytest

from app import celery_app as celery_module
from app.config import settings
from app.neo4j_client import Neo4jClient
from app.routers import lectures as lectures_router


# ── Neo4j ────────────────────────────────────────────────────────────────────

class FakeResult:
    def __init__(self, record=None):
        self.record = record

    async def single(self):
        return self.record


class FakeTx:
    def __init__(self, log, fail_on=None):
        self.log, self.fail_on = log, fail_on

    async def run(self, query, **params):
        if self.fail_on and self.fail_on in query:
            raise RuntimeError("write failed")
        self.log.append((query.strip().split()[0], params))
        return FakeResult({"edges": len(params.get("rels", []))})


class FakeSession:
    def __init__(self, driver):
        self.driver = driver

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def run(self, query, **params):
        self.driver.schema.append(query)
        return FakeResult()

    async def execute_write(self, work):
        staged = []
        result = await work(FakeTx(staged, self.driver.fail_on))
        self.driver.committed.extend(staged)  # only reached when the whole unit succeeded
        return result


class FakeDriver:
    def __init__(self, fail_connect=False, fail_on=None):
        self.fail_connect, self.fail_on = fail_connect, fail_on
        self.schema, self.committed, self.databases, self.closed = [], [], [], False

    async def verify_connectivity(self):
        if self.fail_connect:
            raise OSError("cannot resolve neo4j+s://secret-host")

    def session(self, database=None):
        self.databases.append(database)
        return FakeSession(self)

    async def close(self):
        self.closed = True


@pytest.fixture
def neo4j(monkeypatch):
    holder = {}

    def factory(uri, auth, **options):
        holder["options"] = options
        return holder.setdefault("driver", FakeDriver(**holder.get("kwargs", {})))

    import neo4j as neo4j_pkg

    monkeypatch.setattr(neo4j_pkg.AsyncGraphDatabase, "driver", staticmethod(factory))
    monkeypatch.setattr(settings, "NEO4J_URI", "neo4j+s://example.databases.neo4j.io")
    monkeypatch.setattr(settings, "NEO4J_PASSWORD", "pw")
    monkeypatch.setattr(settings, "NEO4J_DATABASE", "neo4j")
    return holder


CONCEPTS = [{"id": "l:a", "name": "A", "definition": "d"}, {"id": "l:b", "name": "B", "definition": "d"}]
EDGES = [{"from": "l:a", "to": "l:b", "strength": 0.7}]


def test_neo4j_connect_creates_constraints_and_uses_pool_settings(neo4j):
    client = Neo4jClient()
    asyncio.run(client.connect())
    assert client.driver is not None
    assert neo4j["options"]["max_connection_pool_size"] == settings.NEO4J_MAX_POOL_SIZE
    assert neo4j["options"]["connection_timeout"] == settings.NEO4J_CONNECTION_TIMEOUT
    schema = " ".join(neo4j["driver"].schema)
    assert "concept_id IS UNIQUE" in schema and "user_id IS UNIQUE" in schema
    assert set(neo4j["driver"].databases) == {"neo4j"}


def test_neo4j_connection_failure_disables_graph_and_hides_uri(neo4j, caplog):
    neo4j["kwargs"] = {"fail_connect": True}
    client = Neo4jClient()
    asyncio.run(client.connect())
    assert client.driver is None and neo4j["driver"].closed
    assert "secret-host" not in caplog.text


def test_replace_lecture_graph_is_one_transaction(neo4j):
    client = Neo4jClient()
    asyncio.run(client.connect())
    nodes, edges = asyncio.run(client.replace_lecture_graph("l", CONCEPTS, EDGES))
    assert (nodes, edges) == (2, 1)
    verbs = [verb for verb, _ in neo4j["driver"].committed]
    assert verbs == ["MATCH", "UNWIND", "UNWIND"]  # delete old mirror, then MERGE nodes and edges


def test_replace_lecture_graph_failure_commits_nothing(neo4j):
    neo4j["kwargs"] = {"fail_on": "PREREQUISITE_OF"}
    client = Neo4jClient()
    asyncio.run(client.connect())
    with pytest.raises(RuntimeError):
        asyncio.run(client.replace_lecture_graph("l", CONCEPTS, EDGES))
    assert neo4j["driver"].committed == []


def test_neo4j_disabled_is_a_noop():
    client = Neo4jClient()
    assert asyncio.run(client.replace_lecture_graph("l", CONCEPTS, EDGES)) == (0, 0)
    assert asyncio.run(client.delete_user_node("u")) is None


# ── Redis / Celery ───────────────────────────────────────────────────────────

def test_rediss_url_gets_verified_tls():
    config = celery_module.build_celery_config("rediss://default:pw@host.upstash.io:6379")
    assert config["broker_use_ssl"] == {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    assert config["redis_backend_use_ssl"] == {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    assert config["broker_connection_timeout"] == 10


def test_rediss_url_honours_explicit_cert_setting():
    config = celery_module.build_celery_config("rediss://h:6379?ssl_cert_reqs=CERT_NONE")
    assert config["broker_use_ssl"]["ssl_cert_reqs"] == ssl.CERT_NONE


def test_plain_redis_has_no_tls():
    assert "broker_use_ssl" not in celery_module.build_celery_config("redis://localhost:6379")


def test_celery_accepts_tls_config():
    from celery import Celery

    app = Celery("t", broker="rediss://h:6379", backend="rediss://h:6379")
    app.conf.update(celery_module.build_celery_config("rediss://h:6379"))
    assert app.conf.broker_use_ssl["ssl_cert_reqs"] == ssl.CERT_REQUIRED


class _Tasks:
    def __init__(self):
        self.added = []

    def add_task(self, fn, *args):
        self.added.append((fn, args))


def test_unreachable_redis_falls_back_to_in_process(monkeypatch):
    monkeypatch.setattr(settings, "USE_CELERY", True)

    class Control:
        def inspect(self, timeout):
            raise ConnectionError("redis://user:pw@host unreachable")

    class Task:
        app = type("A", (), {"control": Control()})()

    monkeypatch.setattr(lectures_router, "process_lecture", Task())
    tasks = _Tasks()
    task_id = lectures_router._queue_processing("lec-1", tasks)
    assert task_id.startswith("local-") and tasks.added[0][1] == ("lec-1",)


def test_celery_dispatch_when_worker_answers(monkeypatch):
    monkeypatch.setattr(settings, "USE_CELERY", True)

    class Inspector:
        def ping(self):
            return {"worker@1": {"ok": "pong"}}

    class Task:
        app = type("A", (), {"control": type("C", (), {"inspect": lambda self, timeout: Inspector()})()})()

        def delay(self, lecture_id):
            return type("R", (), {"id": f"celery-{lecture_id}"})()

    monkeypatch.setattr(lectures_router, "process_lecture", Task())
    tasks = _Tasks()
    assert lectures_router._queue_processing("lec-2", tasks) == "celery-lec-2"
    assert tasks.added == []


def test_without_celery_runs_in_background_task(monkeypatch):
    monkeypatch.setattr(settings, "USE_CELERY", False)
    tasks = _Tasks()
    assert lectures_router._queue_processing("lec-3", tasks).startswith("bg-")
    assert tasks.added[0][1] == ("lec-3",)
