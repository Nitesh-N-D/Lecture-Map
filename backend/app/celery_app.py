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


try:
    from celery import Celery

    celery_app = Celery(
        "lecturemap",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
        include=["app.tasks.pipeline"],
    )

    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        result_expires=86400,
    )
except Exception:
    celery_app = LocalCelery()
