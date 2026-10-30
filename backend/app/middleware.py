"""Request IDs, security headers, request-size limits and rate limiting."""
import logging
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

logger = logging.getLogger(__name__)

# (method, path prefix) -> (bucket, max requests, window seconds)
RATE_RULES = [
    ("POST", "/auth/login", "auth", 10, 60),
    ("POST", "/auth/signup", "auth", 10, 60),
    ("POST", "/auth/guest", "guest", 10, 60),
    ("GET", "/auth/google", "oauth", 20, 60),
    ("DELETE", "/auth/me", "auth", 10, 60),
    ("POST", "/lectures/upload", "upload", 20, 3600),
    ("POST", "/review/", "review", 120, 60),
]
JSON_BODY_LIMIT = 1024 * 1024  # 1 MiB for everything except uploads
UPLOAD_OVERHEAD = 1024 * 1024  # multipart framing on top of MAX_UPLOAD_MB


def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """In-process sliding window. Per instance only: with several API replicas
    the effective limit is multiplied, so use an edge/Redis limiter if you scale out."""

    def __init__(self):
        self.hits: dict[tuple[str, str], deque] = defaultdict(deque)

    def check(self, key: tuple[str, str], limit: int, window: int) -> int:
        """Return 0 if allowed, else seconds until the client may retry."""
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] >= window:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(window - (now - q[0])) + 1)
        q.append(now)
        if len(self.hits) > 10000:  # bound memory
            for k in [k for k, v in self.hits.items() if not v][:5000]:
                del self.hits[k]
        return 0


limiter = RateLimiter()


def _error(request: Request, status: int, detail: str, headers: dict | None = None) -> JSONResponse:
    return JSONResponse(
        {"detail": detail, "request_id": getattr(request.state, "request_id", None)},
        status_code=status,
        headers=headers,
    )


class RequestGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request.state.request_id = incoming if 8 <= len(incoming) <= 64 and incoming.isascii() and incoming.replace("-", "").isalnum() else uuid.uuid4().hex

        # Size limit, checked before the body is read.
        length = request.headers.get("content-length")
        if length is not None:
            try:
                size = int(length)
            except ValueError:
                return _error(request, 400, "Invalid Content-Length header")
            cap = settings.MAX_UPLOAD_MB * 1024 * 1024 + UPLOAD_OVERHEAD if request.url.path == "/lectures/upload" else JSON_BODY_LIMIT
            if size > cap:
                return _error(request, 413, "Request body is too large")

        if settings.RATE_LIMIT_ENABLED:
            for method, prefix, bucket, limit, window in RATE_RULES:
                if request.method == method and request.url.path.startswith(prefix):
                    wait = limiter.check((client_ip(request), bucket), limit, window)
                    if wait:
                        return _error(request, 429, "Too many requests. Please slow down and try again shortly.",
                                      {"Retry-After": str(wait)})
                    break

        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # The API serves JSON/files only, so nothing may be framed, scripted or embedded from it.
        if request.url.path not in ("/docs", "/redoc"):
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        if request.url.path.startswith(("/auth", "/export")):
            response.headers.setdefault("Cache-Control", "no-store")
        if settings.ENVIRONMENT == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", uuid.uuid4().hex)
    logger.exception("Unhandled error [request_id=%s] %s %s", request_id, request.method, request.url.path)
    return JSONResponse(
        {"detail": "Something went wrong on our side. Please try again.", "request_id": request_id},
        status_code=500,
        headers={"X-Request-ID": request_id},
    )
