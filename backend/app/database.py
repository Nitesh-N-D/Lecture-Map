from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import inspect, text
from app.config import settings
import logging

logger = logging.getLogger(__name__)


def _engine_kwargs(database_url: str) -> dict:
    kwargs = {
        "echo": settings.ENVIRONMENT == "development",
        "pool_pre_ping": True,
    }

    if database_url.startswith("sqlite"):
        return kwargs

    kwargs.update(
        {
            "pool_recycle": 300,
            "pool_size": 1,
            "max_overflow": 0,
            "connect_args": {"statement_cache_size": 0},
        }
    )
    return kwargs


engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs(settings.DATABASE_URL))

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables on startup."""
    from app.models import user, lecture, flashcard, study_session, review_log  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all does not add new columns to an existing local SQLite DB.
        # Keep lightweight self-hosted installs working; Alembic handles the
        # same schema change in managed production deployments.
        columns = await conn.run_sync(lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("lectures")})
        if "graph_data" not in columns:
            await conn.execute(text("ALTER TABLE lectures ADD COLUMN graph_data TEXT"))
        if "visited_concept_ids" not in columns:
            await conn.execute(text("ALTER TABLE lectures ADD COLUMN visited_concept_ids TEXT"))
        user_columns = await conn.run_sync(lambda sync_conn: {c["name"] for c in inspect(sync_conn).get_columns("users")})
        if "token_version" not in user_columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"))
        if "gemini_api_key_enc" not in user_columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN gemini_api_key_enc TEXT"))
    logger.info("Database tables created/verified")
