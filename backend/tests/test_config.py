"""Environment-specific behaviour: production is strict, development is permissive."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def run(snippet, **env):
    full = {**os.environ, "DATABASE_URL": "sqlite+aiosqlite:///:memory:", "JWT_SECRET": "x" * 40, **env}
    return subprocess.run(
        [sys.executable, "-c", snippet], cwd=BACKEND, env=full, capture_output=True, text=True, timeout=120
    )


def test_production_rejects_urls_with_no_public_https_entry():
    for frontend, backend in (
        ("http://localhost:5173", "https://api.example.com"),
        ("https://app.example.com", "http://api.example.com"),
        ("https://app.example.com", "https://localhost:8000"),
    ):
        result = run("import app.config", ENVIRONMENT="production", FRONTEND_URL=frontend, BACKEND_URL=backend)
        assert result.returncode != 0 and "public https" in result.stderr


def test_production_disables_docs_and_allows_only_configured_origin():
    snippet = (
        "import app.main as m;"
        "print(m.app.docs_url, m.app.openapi_url);"
        "cors=[x for x in m.app.user_middleware if x.cls.__name__=='CORSMiddleware'][0];"
        "print(cors.kwargs['allow_origins'])"
    )
    result = run(snippet, ENVIRONMENT="production", FRONTEND_URL="https://app.example.com",
                 BACKEND_URL="https://api.example.com", CORS_ORIGINS="")
    assert result.returncode == 0, result.stderr
    assert "None None" in result.stdout
    assert "['https://app.example.com']" in result.stdout


def test_development_allows_localhost_and_docs():
    snippet = (
        "import app.main as m;"
        "print(m.app.docs_url);"
        "cors=[x for x in m.app.user_middleware if x.cls.__name__=='CORSMiddleware'][0];"
        "print(cors.kwargs['allow_origins'])"
    )
    result = run(snippet, ENVIRONMENT="development", FRONTEND_URL="http://localhost:5173",
                 BACKEND_URL="http://localhost:8000")
    assert result.returncode == 0, result.stderr
    assert "/docs" in result.stdout and "http://localhost:5173" in result.stdout


def test_unknown_environment_variables_are_ignored():
    result = run("import app.config", ENVIRONMENT="development", PYTHON_VERSION="3.11.9")
    assert result.returncode == 0, result.stderr


DUAL = dict(FRONTEND_URL="http://localhost:5173,https://app.example.com",
            BACKEND_URL="http://localhost:8000,https://api.example.com")


def test_one_env_file_can_list_local_and_deployed_urls():
    snippet = (
        "from app.config import deployment_urls as d;"
        "print(d('localhost:8000'));print(d('api.example.com'));print(d('unknown.host'))"
    )
    dev = run(snippet, ENVIRONMENT="development", **DUAL)
    assert dev.returncode == 0, dev.stderr
    lines = dev.stdout.strip().splitlines()
    assert lines[0] == "('http://localhost:5173', 'http://localhost:8000')"
    assert lines[1] == "('https://app.example.com', 'https://api.example.com')"
    assert lines[2] == lines[0]  # unknown host falls back to the first entry

    prod = run(snippet, ENVIRONMENT="production", **DUAL)
    assert prod.returncode == 0, prod.stderr
    # Production ignores localhost entries entirely, whatever host the request claims.
    assert set(prod.stdout.strip().splitlines()) == {"('https://app.example.com', 'https://api.example.com')"}


def test_production_cors_ignores_localhost_entries():
    snippet = (
        "import app.main as m;"
        "cors=[x for x in m.app.user_middleware if x.cls.__name__=='CORSMiddleware'][0];"
        "print(cors.kwargs['allow_origins'])"
    )
    result = run(snippet, ENVIRONMENT="production", **DUAL)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "['https://app.example.com']"


def test_unknown_environment_name_warns_instead_of_silently_passing():
    result = run("import app.config", ENVIRONMENT="developement")
    assert result.returncode == 0 and "Unknown ENVIRONMENT" in result.stderr
