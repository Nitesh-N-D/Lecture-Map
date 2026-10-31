import logging
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
    # Startup
    logger.info("Starting LectureMap API...")

    # PostgreSQL
    await init_db()

    # Lectures left PENDING/PROCESSING by a previous process would spin forever.
    try:
        from app.tasks.pipeline import recover_interrupted_lectures

        recovered = await run_in_threadpool(
            recover_interrupted_lectures, all_in_flight=not settings.USE_CELERY
        )
        if recovered:
            logger.warning("Marked %s interrupted lecture(s) as FAILED (retry available)", recovered)
    except Exception as e:
        logger.warning(f"Interrupted-lecture recovery skipped: {e}")

    # Neo4j (don't crash if unavailable)
    try:
        await neo4j_client.connect()
        if neo4j_client.driver:
            logger.info("Neo4j connected")
        else:
            logger.info("Neo4j disabled")
    except Exception as e:
        logger.warning(f"Neo4j unavailable: {e}")

    yield

    # Shutdown
    try:
        await neo4j_client.close()
    except Exception:
        pass

    logger.info("LectureMap API shutdown")


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
