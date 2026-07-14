from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://dev:dev@localhost:5432/lecturemap"
    
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_BUCKET: str = "lecture-files"
    
    # Neo4j Aura
    NEO4J_URI: str = ""
    NEO4J_USERNAME: str = "neo4j"
    NEO4J_PASSWORD: str = ""
    
    # Redis (Upstash)
    REDIS_URL: str = "redis://localhost:6379"

    # Set to False on Render (free plan has no background-worker tier, so
    # there's nothing to consume the Celery queue — tasks would sit
    # PENDING forever). Leave True for local docker-compose, which runs a
    # real Celery worker + Redis. When False, lectures are processed
    # in-process via FastAPI BackgroundTasks on the web service instead.
    USE_CELERY: bool = True
    
    # AI
    GEMINI_API_KEY: str = ""
    
    # Auth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET: str = "change-me-in-production-256-bit-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    GUEST_TOKEN_EXPIRE_MINUTES: int = 1440    # 24 hours
    
    # App
    FRONTEND_URL: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()