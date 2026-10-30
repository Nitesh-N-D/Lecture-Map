"""Live smoke checks against the services configured in backend/.env.

Run manually:  python scripts/live_integration_check.py
Prints only PASS/FAIL per service (never values). Writes one uniquely named
test object/node and removes it afterwards. Does NOT run migrations or write to
the configured DATABASE_URL (read-only `SELECT 1`).
"""
import asyncio, os, sys, tempfile, uuid
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

results = {}

def rec(name, ok, note=""):
    results[name] = ok
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {note}")

async def check_db():
    from sqlalchemy import text
    from app.database import engine
    try:
        async with engine.connect() as c:
            await c.execute(text("SELECT 1"))
        rec("database connect", True, engine.dialect.name)
    except Exception as e:
        rec("database connect", False, type(e).__name__)

async def check_gemini():
    from app.services.concept_extraction import extract_concepts_and_edges
    text_ = ("Photosynthesis converts light energy into chemical energy. The light reactions in the "
             "thylakoid membranes produce ATP and NADPH. The Calvin cycle then uses ATP and NADPH to "
             "fix carbon dioxide into glucose. Chlorophyll absorbs the light that drives the process.")
    try:
        r = await extract_concepts_and_edges(text_, "live-check")
        rec("gemini extraction", r.get("source") == "gemini" and len(r["concepts"]) > 0,
            f"source={r.get('source')} concepts={len(r['concepts'])} edges={len(r['edges'])}")
    except Exception as e:
        rec("gemini extraction", False, type(e).__name__ + ": " + str(e)[:120])

def check_storage():
    from app.services import storage
    key = f"live-check/{uuid.uuid4().hex}.txt"
    ref = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
            f.write("lecturemap live check"); p = f.name
        ref = storage.save_file(p, key, "text/plain")
        if not ref.startswith("supabase:"):
            rec("supabase storage", False, "fell back to " + ref.split(":")[0]); return
        d = p + ".dl"
        storage.fetch_file(ref, d)
        ok = open(d).read() == "lecturemap live check"
        rec("supabase storage upload+download", ok)
    except Exception as e:
        rec("supabase storage upload+download", False, type(e).__name__ + ": " + str(e)[:120])
    finally:
        storage.delete_file(ref)

async def check_neo4j():
    from app.neo4j_client import neo4j_client
    lid = "livecheck-" + uuid.uuid4().hex[:8]
    try:
        await neo4j_client.connect()
        a, b = f"{lid}:a", f"{lid}:b"
        await neo4j_client.create_concept_node(lecture_id=lid, concept_id=a, name="A", definition="d", timestamp_seconds=0, difficulty="beginner")
        await neo4j_client.create_concept_node(lecture_id=lid, concept_id=b, name="B", definition="d", timestamp_seconds=0, difficulty="beginner")
        await neo4j_client.create_dependency_edge(from_id=a, to_id=b, lecture_id=lid, strength=0.5)
        g = await neo4j_client.get_graph(lid)
        rec("neo4j write+read", len(g.get("nodes", g.get("concepts", []))) == 2, str({k: len(v) for k, v in g.items() if isinstance(v, list)}))
    except Exception as e:
        rec("neo4j write+read", False, type(e).__name__ + ": " + str(e)[:120])
    finally:
        try:
            await neo4j_client.delete_lecture_graph(lid)
            await neo4j_client.close()
        except Exception:
            pass

def check_redis():
    try:
        import redis
        ok = redis.Redis.from_url(settings.REDIS_URL.replace('CERT_NONE','none').replace('CERT_REQUIRED','required'), socket_connect_timeout=8).ping()
        rec("redis ping", bool(ok))
    except Exception as e:
        rec("redis ping", False, type(e).__name__ + ": " + str(e)[:100])

async def main():
    await check_db(); await check_gemini(); check_storage(); await check_neo4j(); check_redis()
    sys.exit(0 if all(results.values()) else 1)

asyncio.run(main())
