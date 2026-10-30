from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv
import os, sys
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import Base
from app.models import user, lecture, flashcard, study_session  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Use the app's DATABASE_URL (async driver) converted to its sync equivalent,
# e.g. sqlite+aiosqlite -> sqlite, postgresql+asyncpg -> postgresql.
from app.config import settings
from app.tasks.pipeline import _sync_database_url

if os.getenv("DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", _sync_database_url(settings.DATABASE_URL).replace("%", "%%"))


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
