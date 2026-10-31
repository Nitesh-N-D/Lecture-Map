import asyncio

import pytest

from app.services import concept_extraction as ce
from app.config import settings
from app.services.concept_extraction import _gemini_failure_message


class NotFound(Exception): ...
class PermissionDenied(Exception): ...
class ResourceExhausted(Exception): ...


def test_permanent_errors_have_actionable_messages_without_secrets():
    assert "GEMINI_MODEL" in _gemini_failure_message(NotFound("404 models/x key=SECRET"))
    assert "GEMINI_API_KEY" in _gemini_failure_message(PermissionDenied("bad key SECRET"))
    for err in (NotFound("SECRET"), PermissionDenied("SECRET"), ResourceExhausted("SECRET")):
        assert "SECRET" not in _gemini_failure_message(err)


def test_unknown_errors_name_only_the_type():
    assert _gemini_failure_message(ValueError("x")) == "Gemini request failed: ValueError"


class ServiceUnavailable(Exception):
    pass


class FakeResponse:
    text = "[]"


def test_gemini_request_success(monkeypatch):
    monkeypatch.setattr(ce, "_call_model", lambda *args: FakeResponse())
    assert asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8)) == "[]"


def test_temporary_5xx_retries_then_succeeds_with_jitter(monkeypatch):
    calls, delays = [], []
    def request(*args):
        calls.append(1)
        if len(calls) == 1:
            raise ServiceUnavailable("503")
        return FakeResponse()
    async def sleep(delay):
        delays.append(delay)
    monkeypatch.setattr(ce, "_call_model", request)
    monkeypatch.setattr(ce.asyncio, "sleep", sleep)
    monkeypatch.setattr(ce.random, "uniform", lambda low, high: high / 2)
    assert asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8)) == "[]"
    assert len(calls) == 2 and len(delays) == 1 and delays[0] > 0


def test_network_timeout_retries_but_authentication_does_not(monkeypatch):
    async def no_wait(_):
        pass
    calls = []
    def timeout_then_success(*args):
        calls.append(1)
        if len(calls) == 1:
            raise TimeoutError("network timeout")
        return FakeResponse()
    monkeypatch.setattr(ce, "_call_model", timeout_then_success)
    monkeypatch.setattr(ce.asyncio, "sleep", no_wait)
    assert asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8)) == "[]"
    assert len(calls) == 2

    class Unauthenticated(Exception):
        status_code = 401
    calls.clear()
    monkeypatch.setattr(ce, "_call_model", lambda *args: (calls.append(1), (_ for _ in ()).throw(Unauthenticated("invalid API key")))[1])
    with pytest.raises(ce.GeminiRequestError) as result:
        asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8))
    assert result.value.code == "invalid_api_key" and len(calls) == 1


def test_quota_failure_stops_without_retries_and_honors_retry_after(monkeypatch):
    class ResourceExhausted(Exception):
        retry_after = 23
    calls = []
    monkeypatch.setattr(ce, "_call_model", lambda *args: (calls.append(1), (_ for _ in ()).throw(ResourceExhausted("quota")))[1])
    token = ce.user_gemini_key.set("secret-key")
    try:
        with pytest.raises(ce.GeminiRequestError) as result:
            asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8))
    finally:
        ce.user_gemini_key.reset(token)
    assert result.value.code == "quota_exhausted" and result.value.retry_after == 23
    assert "secret-key" not in str(result.value) and len(calls) == 1


@pytest.mark.parametrize("error, code", [
    (PermissionDenied("invalid API key"), "invalid_api_key"),
    (NotFound("unknown model"), "invalid_model"),
    (TimeoutError("timed out"), "network_timeout"),
])
def test_permanent_and_timeout_error_classification(error, code):
    assert ce._classify_gemini_error(error)[0] == code
    assert ce._classify_gemini_error(error)[1] is False if code != "network_timeout" else ce._classify_gemini_error(error)[1] is True


def test_transient_retry_exhaustion_is_bounded(monkeypatch):
    calls = []
    async def no_wait(_):
        pass
    def request(*args):
        calls.append(1)
        raise ServiceUnavailable("503")
    monkeypatch.setattr(settings, "GEMINI_MAX_ATTEMPTS", 3)
    monkeypatch.setattr(ce, "_call_model", request)
    monkeypatch.setattr(ce.asyncio, "sleep", no_wait)
    with pytest.raises(ce.GeminiRequestError) as result:
        asyncio.run(ce._generate_text(None, "safe", temperature=0, max_tokens=8))
    assert result.value.code == "temporary_server_error" and len(calls) == 3
