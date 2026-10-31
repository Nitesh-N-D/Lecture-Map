import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import frontend_urls, settings
from app.database import init_db
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.middleware import RequestGuardMiddleware, http_error_handler, unhandled_exception_handler, validation_error_handler
from app.neo4j_client import neo4j_client
from app.routers import auth, lectures, graph, flashcards, export, user_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting LectureMap API...")
    app.state.dependencies = {"database": "initializing", "neo4j": "initializing"}
    # Defer all network/database initialization until after ASGI startup has
    # yielded, so Render/Uvicorn can bind the HTTP port while services recover.
    dependency_task = asyncio.create_task(_initialize_dependencies(app))
    try:
        yield
    finally:
        dependency_task.cancel()
        try:
            await dependency_task
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Dependency initialization task stopped unexpectedly")
    try:
        await neo4j_client.close()
    except Exception as exc:
        logger.warning("Neo4j shutdown failed (%s)", type(exc).__name__)
    logger.info("LectureMap API shutdown")


async def _initialize_dependencies(app: FastAPI):
    """Initialize integrations in the background with bounded attempts."""
    retries = max(1, settings.STARTUP_DEPENDENCY_RETRIES)
    for attempt in range(1, retries + 1):
        try:
            await asyncio.wait_for(init_db(), timeout=settings.DB_CONNECT_TIMEOUT_SECONDS + 5)
            app.state.dependencies["database"] = "available"
            logger.info("Database initialized")
            break
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            app.state.dependencies["database"] = "unavailable"
            logger.warning("Database initialization attempt %s/%s failed (%s)", attempt, retries, type(exc).__name__)
            if attempt < retries:
                await asyncio.sleep(settings.STARTUP_RETRY_DELAY_SECONDS * attempt)
    else:
        logger.error("Database unavailable after %s bounded startup attempts", retries)

    if app.state.dependencies["database"] == "available":
        try:
            from app.tasks.pipeline import recover_interrupted_lectures

            recovered = await asyncio.wait_for(
                run_in_threadpool(recover_interrupted_lectures, all_in_flight=not settings.USE_CELERY),
                timeout=settings.DB_CONNECT_TIMEOUT_SECONDS + 5,
            )
            if recovered:
                logger.warning("Marked %s interrupted lecture(s) as FAILED (retry available)", recovered)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Interrupted-lecture recovery skipped (%s)", type(exc).__name__)

    for attempt in range(1, retries + 1):
        try:
            await asyncio.wait_for(
                neo4j_client.connect(), timeout=max(1.0, settings.NEO4J_CONNECTION_TIMEOUT + 2)
            )
            if neo4j_client.driver:
                app.state.dependencies["neo4j"] = "available"
                break
            app.state.dependencies["neo4j"] = "unavailable"
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            app.state.dependencies["neo4j"] = "unavailable"
            logger.warning("Neo4j initialization attempt %s/%s failed (%s)", attempt, retries, type(exc).__name__)
        if attempt < retries and settings.NEO4J_URI:
            await asyncio.sleep(settings.STARTUP_RETRY_DELAY_SECONDS * attempt)
    if app.state.dependencies["neo4j"] != "available":
        logger.warning("Neo4j unavailable after bounded startup attempts; graph integration is degraded")


app = FastAPI(
    title="LectureMap API",
    description="Transform lecture audio/video into interactive knowledge graphs",
    version="1.0.0",
    lifespan=lifespan,
    # Interactive API docs are a development convenience only.
    docs_url=None if settings.ENVIRONMENT == "production" else "/docs",
    redoc_url=None if settings.ENVIRONMENT == "production" else "/redoc",
    openapi_url=None if settings.ENVIRONMENT == "production" else "/openapi.json",
)

# CORS: the configured frontend, optional extras, and local dev servers outside production.
_origins = set(frontend_urls())
_origins.update(o.strip().rstrip("/") for o in settings.CORS_ORIGINS.split(",") if o.strip())
if settings.ENVIRONMENT != "production":
    _origins.update({
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000",
    })
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestGuardMiddleware)
app.add_exception_handler(Exception, unhandled_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

# Session Middleware (IMPORTANT for Google OAuth)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET or settings.JWT_SECRET,
    same_site="lax",
    https_only=settings.ENVIRONMENT == "production",
    max_age=3600,
)

# Routers
app.include_router(auth.router)
app.include_router(lectures.router)
app.include_router(graph.router)
app.include_router(flashcards.router)
app.include_router(export.router)
app.include_router(user_settings.router)


@app.get("/health")
async def health():
    from app.services.storage import storage_status

    storage = storage_status()
    return {
        "status": "ok",
        "version": "1.0.0",
        "neo4j": neo4j_client.driver is not None,
        "storage": storage["backend"],
        "storage_ok": storage["ok"],
        "queue": "celery" if settings.USE_CELERY else "in-process",
    }


@app.get("/health/dependencies")
async def dependency_health():
    """Report integration state separately from the lightweight liveness probe."""
    return {
        "status": "ok" if all(v == "available" for v in app.state.dependencies.values()) else "degraded",
        "dependencies": dict(app.state.dependencies),
    }
