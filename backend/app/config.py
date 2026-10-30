from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    # SQLite makes the app runnable on a fresh local checkout. Set this to a
    # Supabase/Postgres connection string for a deployed installation.
    DATABASE_URL: str = "sqlite+aiosqlite:///./lecturemap.db"
    
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
    USE_CELERY: bool = False
    
    # AI
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3-flash-preview"

    # Auth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    JWT_SECRET: str = "change-me-in-production-256-bit-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    GUEST_TOKEN_EXPIRE_MINUTES: int = 1440    # 24 hours
    
    # App
    FRONTEND_URL: str = "http://localhost:5173"
    # Extra allowed browser origins, comma separated (FRONTEND_URL is always allowed).
    CORS_ORIGINS: str = ""
    # Signs the OAuth session cookie; falls back to JWT_SECRET when unset.
    SESSION_SECRET: str = ""
    # The public API origin. This is used for OAuth callback URLs, which must
    # exactly match the URL registered with Google. Set it to the Render API
    # URL in production (for example https://lecturemap-api.onrender.com).
    BACKEND_URL: str = "http://localhost:8000"
    ENVIRONMENT: str = "development"
    RATE_LIMIT_ENABLED: bool = True
    # Honour X-Forwarded-For for client IPs. Enable only behind a trusted proxy
    # (Render, nginx) that sets it; otherwise clients could spoof their address.
    TRUST_PROXY_HEADERS: bool = False

    # Storage. Local files live in UPLOAD_DIR (resolved relative to the backend
    # working directory) so the API and the worker always agree on the path.
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 200
    # When Supabase is configured, uploads must succeed there; there is no silent
    # fallback to local disk unless this is explicitly enabled.
    ALLOW_LOCAL_STORAGE_FALLBACK: bool = False
    GUEST_RETENTION_HOURS: int = 48

    class Config:
        env_file = ".env"
        case_sensitive = True
        # Hosting platforms and local .env files carry unrelated variables
        # (e.g. PYTHON_VERSION); they must not stop the app from starting.
        extra = "ignore"


settings = Settings()

DEFAULT_JWT_SECRET = "change-me-in-production-256-bit-secret"
if settings.ENVIRONMENT == "production" and (
    settings.JWT_SECRET == DEFAULT_JWT_SECRET or len(settings.JWT_SECRET) < 32
):
    raise RuntimeError(
        "JWT_SECRET must be set to a random value of at least 32 characters when ENVIRONMENT=production"
    )


def _is_local(url: str) -> bool:
    host = url.split("://", 1)[-1].split("/", 1)[0].split(":", 1)[0]
    return host in ("localhost", "127.0.0.1", "0.0.0.0", "::1")


def _split_urls(value: str) -> list[str]:
    return [u.strip().rstrip("/") for u in value.split(",") if u.strip()]


def _usable(urls: list[str]) -> list[str]:
    """Production only uses public https URLs, so one env file can list both the
    localhost and the deployed URL and each environment picks its own."""
    if settings.ENVIRONMENT == "production":
        return [u for u in urls if u.startswith("https://") and not _is_local(u)]
    return urls


def frontend_urls() -> list[str]:
    return _usable(_split_urls(settings.FRONTEND_URL))


def backend_urls() -> list[str]:
    return _usable(_split_urls(settings.BACKEND_URL))


def deployment_urls(request_host: str | None = None) -> tuple[str, str]:
    """(frontend, backend) base URLs for this request.

    ``FRONTEND_URL`` and ``BACKEND_URL`` may each list several comma separated
    entries in the same order (for example localhost first, deployed second). The
    backend entry whose host matches the incoming request is chosen, and the
    frontend at the same position is used for redirects back to the app."""
    fronts, backs = frontend_urls(), backend_urls()
    index = 0
    if request_host:
        hosts = [b.split("://", 1)[-1].split("/", 1)[0] for b in backs]
        if request_host in hosts:
            index = hosts.index(request_host)
    backend = backs[min(index, len(backs) - 1)]
    frontend = fronts[index] if len(fronts) == len(backs) else fronts[0]
    return frontend, backend


KNOWN_ENVIRONMENTS = {"production", "development", "test"}
if settings.ENVIRONMENT not in KNOWN_ENVIRONMENTS:
    import logging

    logging.getLogger(__name__).warning(
        "Unknown ENVIRONMENT %r: treating it as development. Use one of %s; "
        "production safeguards only apply when it is exactly 'production'.",
        settings.ENVIRONMENT, sorted(KNOWN_ENVIRONMENTS),
    )

if settings.ENVIRONMENT == "production":
    if not frontend_urls() or not backend_urls():
        raise RuntimeError(
            "FRONTEND_URL and BACKEND_URL must include a public https:// URL when ENVIRONMENT=production"
        )
