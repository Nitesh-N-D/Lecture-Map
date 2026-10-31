from app.config import settings


class LocalTask:
    def __init__(self, func=None, **_kwargs):
        self.func = func
        self.id = "local"

    def __call__(self, *args, **kwargs):
        if self.func is None:
            return self
        return self.func(*args, **kwargs)

    def delay(self, *_args, **_kwargs):
        raise RuntimeError("Celery is not installed or not available")

    def retry(self, exc=None, **_kwargs):
        if exc:
            raise exc
        raise RuntimeError("Celery retry requested without an exception")


class LocalCelery:
    def task(self, *dargs, **dkwargs):
        def decorator(func):
            return LocalTask(func, **dkwargs)

        if dargs and callable(dargs[0]):
            return decorator(dargs[0])
        return decorator


def redis_ssl_options(url: str) -> dict | None:
    """TLS options for ``rediss://`` URLs (Upstash requires TLS).

    Celery refuses a ``rediss://`` URL that lacks ``ssl_cert_reqs``; certificate
    verification stays on (CERT_REQUIRED) unless the URL explicitly says otherwise.
    """
    if not url.startswith("rediss://"):
        return None
    import ssl
    from urllib.parse import parse_qs, urlsplit

    requested = (parse_qs(urlsplit(url).query).get("ssl_cert_reqs") or ["required"])[0].lower()
    mapping = {
        "required": ssl.CERT_REQUIRED, "cert_required": ssl.CERT_REQUIRED,
        "optional": ssl.CERT_OPTIONAL, "cert_optional": ssl.CERT_OPTIONAL,
        "none": ssl.CERT_NONE, "cert_none": ssl.CERT_NONE,
    }
    return {"ssl_cert_reqs": mapping.get(requested, ssl.CERT_REQUIRED)}


def build_celery_config(url: str) -> dict:
    config = dict(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        result_expires=86400,
        broker_connection_retry_on_startup=True,
        broker_connection_timeout=10,
        broker_transport_options={"socket_connect_timeout": 10, "socket_timeout": 30,
                                  "health_check_interval": 25, "retry_on_timeout": True},
        redis_socket_connect_timeout=10,
        redis_socket_timeout=30,
        redis_retry_on_timeout=True,
        redis_backend_health_check_interval=25,
    )
    ssl_options = redis_ssl_options(url)
    if ssl_options:
        config["broker_use_ssl"] = ssl_options
        config["redis_backend_use_ssl"] = ssl_options
    return config


try:
    from celery import Celery

    celery_app = Celery(
        "lecturemap",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
        include=["app.tasks.pipeline"],
    )
    celery_app.conf.update(build_celery_config(settings.REDIS_URL))
except Exception:
    celery_app = LocalCelery()
