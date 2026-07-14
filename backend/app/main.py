import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.database import init_db
from app.neo4j_client import neo4j_client
from app.routers import auth, lectures, graph, flashcards, export

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting LectureMap API...")

    # PostgreSQL
    await init_db()

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
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "https://lecture-map.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session Middleware (IMPORTANT for Google OAuth)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.JWT_SECRET,
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


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "1.0.0",
        "neo4j": neo4j_client.driver is not None,
    }
