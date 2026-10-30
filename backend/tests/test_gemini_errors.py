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
