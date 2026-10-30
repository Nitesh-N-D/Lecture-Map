import os
import sys
import tempfile
from pathlib import Path

# Configure an isolated environment before the app is imported.
_TMP = tempfile.mkdtemp(prefix="lecturemap_tests_")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(_TMP, 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(Path(_TMP, "uploads"))
os.environ["ENVIRONMENT"] = "test"
os.environ["USE_CELERY"] = "false"
os.environ["RATE_LIMIT_ENABLED"] = "false"
for key in ("SUPABASE_URL", "SUPABASE_KEY", "NEO4J_URI", "GEMINI_API_KEY"):
    os.environ[key] = ""
# Dummy values so the Google client registers; no test contacts Google.
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-client-secret"
os.environ["FRONTEND_URL"] = "http://frontend.test"
os.environ["BACKEND_URL"] = "http://backend.test"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
