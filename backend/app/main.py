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
    await init_db()
    await neo4j_client.connect()
    yield
    # Shutdown
    await neo4j_client.close()
    logger.info("LectureMap API shutdown")


app = FastAPI(
    title="LectureMap API",
    description="Transform lecture audio/video into interactive knowledge graphs",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=settings.JWT_SECRET)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(lectures.router)
app.include_router(graph.router)
app.include_router(flashcards.router)
app.include_router(export.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
