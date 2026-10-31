"""Storage service and upload/delete flows, with Supabase replaced by an in-memory fake.

No test contacts Supabase. Live verification uses scripts/live_integration_check.py.
"""
import base64
import json
import uuid

import pytest

from app.config import settings
from app.services import storage
from app.services.storage import StorageError
from tests.test_api import client, db_run, make_lecture, no_pipeline, signup  # noqa: F401

PDF = b"%PDF-1.4\n%fake but well-formed header\n"


class FakeBucket:
    def __init__(self, fail=None):
        self.objects: dict[str, bytes] = {}
        self.fail = fail or set()

    def upload(self, path, file, file_options):
        if "upload" in self.fail:
            raise ConnectionError("storage down")
        assert file_options["upsert"] == "false"
        self.objects[path] = file.read()

    def download(self, key):
        if "download" in self.fail or key not in self.objects:
            raise FileNotFoundError(key)
        return self.objects[key]

    def remove(self, keys):
        if "remove" in self.fail:
            raise ConnectionError("storage down")
        for key in keys:
            self.objects.pop(key, None)

    def list(self, prefix):
        return [{"name": k.split("/", 1)[1]} for k in self.objects if k.startswith(prefix + "/")]


class FakeClient:
    def __init__(self, bucket):
        self.bucket = bucket
        self.storage = self

    def from_(self, name):
        assert name == settings.SUPABASE_BUCKET
        return self.bucket


def _jwt(role):
    body = base64.urlsafe_b64encode(json.dumps({"role": role}).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{body}.sig"


@pytest.fixture
def supabase(monkeypatch):
    bucket = FakeBucket()
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_KEY", "sb_secret_test_value")
    monkeypatch.setattr(storage, "_client", lambda url, key: FakeClient(bucket))
    return bucket


def test_key_kinds():
    assert storage.supabase_key_kind("sb_secret_abc") == "secret"
    assert storage.supabase_key_kind("sb_publishable_abc") == "publishable"
    assert storage.supabase_key_kind(_jwt("service_role")) == "service_role"
    assert storage.supabase_key_kind(_jwt("anon")) == "anon"
    assert storage.supabase_key_kind("") == "missing"
    assert storage.supabase_key_kind("garbage") == "unknown"


@pytest.mark.parametrize("key", ["sb_publishable_abc", _jwt("anon")])
def test_public_keys_are_refused_with_actionable_message(monkeypatch, tmp_path, key):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_KEY", key)
    monkeypatch.setattr(storage, "_client", lambda *a: pytest.fail("client must not be created"))
    src = tmp_path / "f.pdf"
    src.write_bytes(PDF)
    with pytest.raises(StorageError, match="secret key"):
        storage.save_file(str(src), f"{uuid.uuid4()}/{uuid.uuid4()}.pdf", "application/pdf")
    assert storage.storage_status()["ok"] is False


def test_save_fetch_delete_roundtrip(supabase, tmp_path):
    src = tmp_path / "f.pdf"
    src.write_bytes(PDF)
    key = f"{uuid.uuid4()}/{uuid.uuid4()}.pdf"
    ref = storage.save_file(str(src), key, "application/pdf")
    assert ref == f"supabase:{key}" and supabase.objects[key] == PDF
    out = storage.fetch_file(ref, str(tmp_path / "copy.pdf"))
    assert open(out, "rb").read() == PDF
    assert storage.delete_file(ref) is True and key not in supabase.objects


@pytest.mark.parametrize("key", ["../etc/passwd", "a/../../b.pdf", "user/x.pdf/../../y", "/abs/x.pdf", "u/x"])
def test_unsafe_keys_rejected(supabase, tmp_path, key):
    src = tmp_path / "f.pdf"
    src.write_bytes(PDF)
    with pytest.raises(StorageError):
        storage.save_file(str(src), key, "application/pdf")


def test_storage_failure_does_not_fall_back_silently(supabase, tmp_path):
    supabase.fail.add("upload")
    src = tmp_path / "f.pdf"
    src.write_bytes(PDF)
    with pytest.raises(StorageError, match="unavailable"):
        storage.save_file(str(src), f"{uuid.uuid4()}/{uuid.uuid4()}.pdf", "application/pdf")
    assert not any(storage.upload_root().rglob("*.pdf.tmp"))


def test_download_failure_is_a_storage_error(supabase, tmp_path):
    with pytest.raises(StorageError, match="Could not download"):
        storage.fetch_file("supabase:u/missing.pdf", str(tmp_path / "x"))


def test_delete_failure_never_raises(supabase):
    supabase.fail.add("remove")
    assert storage.delete_file("supabase:u/x.pdf") is False


def test_production_without_supabase_refuses_local_disk(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_KEY", "")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    src = tmp_path / "f.pdf"
    src.write_bytes(PDF)
    with pytest.raises(StorageError, match="not configured"):
        storage.save_file(str(src), f"{uuid.uuid4()}/{uuid.uuid4()}.pdf", "application/pdf")
    assert storage.storage_status() == {"backend": "unconfigured", "ok": False}


def test_missing_config_for_remote_file(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_KEY", "")
    with pytest.raises(StorageError, match="not configured"):
        storage.fetch_file("supabase:u/x.pdf", str(tmp_path / "x"))


def test_remove_orphans_keeps_referenced_objects(supabase):
    user = str(uuid.uuid4())
    supabase.objects.update({f"{user}/keep.pdf": b"1", f"{user}/orphan.pdf": b"2", "other/x.pdf": b"3"})
    assert storage.remove_orphans(user, {f"supabase:{user}/keep.pdf"}) == 1
    assert set(supabase.objects) == {f"{user}/keep.pdf", "other/x.pdf"}


# ── API flows through the fake bucket ────────────────────────────────────────

def test_upload_stores_under_owner_prefix_and_delete_removes_it(client, supabase):  # noqa: F811
    _, headers, user_id = signup(client)
    r = client.post("/lectures/upload", headers=headers,
                    files={"file": ("../../evil name.pdf", PDF, "application/pdf")})
    assert r.status_code == 200, r.text
    lecture_id = r.json()["lecture_id"]
    assert list(supabase.objects) == [f"{user_id}/{lecture_id}.pdf"]

    assert client.delete(f"/lectures/{lecture_id}", headers=headers).status_code in (200, 204)
    assert supabase.objects == {}


def test_upload_storage_outage_returns_503_and_no_lecture(client, supabase):  # noqa: F811
    supabase.fail.add("upload")
    _, headers, _ = signup(client)
    r = client.post("/lectures/upload", headers=headers, files={"file": ("a.pdf", PDF, "application/pdf")})
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]
    assert client.get("/lectures", headers=headers).json() == []


def test_upload_requires_authentication(client, supabase):  # noqa: F811
    r = client.post("/lectures/upload", files={"file": ("a.pdf", PDF, "application/pdf")})
    assert r.status_code == 401
    assert supabase.objects == {}


def test_other_user_cannot_delete_or_retry_my_lecture(client, supabase):  # noqa: F811
    _, owner, _ = signup(client)
    _, intruder, _ = signup(client)
    lecture_id = client.post("/lectures/upload", headers=owner,
                             files={"file": ("a.pdf", PDF, "application/pdf")}).json()["lecture_id"]
    assert client.delete(f"/lectures/{lecture_id}", headers=intruder).status_code == 404
    assert client.post(f"/lectures/{lecture_id}/retry", headers=intruder).status_code == 404
    assert client.get(f"/lectures/{lecture_id}", headers=intruder).status_code == 404
    assert len(supabase.objects) == 1


def test_account_deletion_removes_files_and_orphans(client, supabase):  # noqa: F811
    _, headers, user_id = signup(client, password="correct-horse-1")
    client.post("/lectures/upload", headers=headers, files={"file": ("a.pdf", PDF, "application/pdf")})
    supabase.objects[f"{user_id}/stray.pdf"] = b"left by a failed request"
    r = client.request("DELETE", "/auth/me", headers=headers,
                       json={"confirm": "DELETE", "password": "correct-horse-1"})
    assert r.status_code in (200, 204), r.text
    assert not any(k.startswith(user_id) for k in supabase.objects)


def test_health_reports_storage_without_secrets(client, supabase):  # noqa: F811
    body = client.get("/health").json()
    assert body["storage"] == "supabase" and body["storage_ok"] is True
    assert "sb_secret" not in json.dumps(body)
