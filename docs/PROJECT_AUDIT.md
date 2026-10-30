# LectureMap — Project Audit

Audit date: 2026-10-30. Scope: full read of the backend (`backend/app`, Alembic, Docker/Render config) and the
frontend core (`App.jsx`, `api/client.js`, `store/useStore.js`, `Review.jsx`, `utils/srs.js`). Frontend pages and
D3 components not listed as "read" below were only checked via a successful production build, **not** reviewed
line by line; findings for them are marked *unverified*.

Status legend: ✅ implemented & working · ⚠️ implemented but defective · 🟡 partial · ❌ missing · 🔑 needs external credentials

## 1. Existing architecture

- **API**: FastAPI (`app/main.py`), routers `auth`, `lectures`, `graph`, `flashcards`, `export`.
- **DB**: SQLAlchemy 2 async (aiosqlite / asyncpg). Models: `User`, `Lecture`, `Flashcard`, `StudySession`.
  Tables created by `init_db()` (`create_all` + ad-hoc `ALTER TABLE`) *and* by Alembic (001, 002).
- **Pipeline** (`tasks/pipeline.py`): sync SQLAlchemy engine; upload → storage → PDF text / faster-whisper →
  Gemini concept extraction → Neo4j (optional) + `lectures.graph_data` JSON snapshot → flashcards.
  Runs via Celery (`USE_CELERY=true`) or FastAPI `BackgroundTasks`.
- **Graph**: Neo4j is primary when connected; `graph_data` JSON is the fallback.
- **Frontend**: React 18 / Vite / Tailwind / D3 / Zustand / Axios.
- **Tests**: none. **CI**: only a Supabase keep-alive workflow.

## 2. Feature checklist

| Feature | Status | Notes |
|---|---|---|
| Email/password signup & login | ⚠️ | Works; signup silently *links a password to an existing passwordless account by email* (account pre-hijack). |
| Guest mode | ⚠️ | Works; guests are never cleaned up after token expiry (only on explicit logout). |
| Google OAuth | 🔑⚠️ | Links to existing account by email **without checking `email_verified`**. |
| JWT | ⚠️ | Default secret is accepted in production; `utcnow()` naive datetimes. |
| Upload (audio/video/PDF) | ⚠️ | Extension-only validation, no empty-file check, `filename=None` crashes, local path is a global tmp dir, silent Supabase→local fallback, local file never deleted. |
| PDF extraction | ⚠️ | Text PDFs only (correct); need encrypted / empty / size handling. Verified in tests below. |
| Whisper transcription | 🟡 | Model reloaded on every call; fine for one job at a time. Not executed here (model download required). |
| Gemini concept extraction | ⚠️ | Deprecated `gemini-1.5-flash` hardcoded; no retries; sync SDK call blocks event loop; truncates at 80k chars instead of chunking; weak ID normalisation; cycle "pruning" drops all edges touching cyclic nodes. |
| Extractive fallback | ⚠️ | Honest labelling OK, but it **fabricates a linear prerequisite chain** between unrelated words. |
| Graph persistence (Neo4j) | ⚠️ | Not executed (no instance). Idempotent MERGE used. |
| Graph snapshot fallback | ⚠️ | `GET graph`, `concepts`, `visit` fall back; **`gaps` returns `[]`, `study-path` and `knowledge-map` need Neo4j and crash/500 without it.** |
| Knowledge gaps | ⚠️ | Neo4j-only; gap definition not tested. |
| Study path | ⚠️ | Neo4j-only. |
| Cross-lecture linking | ⚠️ | Neo4j-only; merges purely by name match. |
| Flashcards generation | ⚠️ | Retried pipeline run duplicates cards; one Gemini call per concept, sequential. |
| SM-2 | ⚠️ | Formula correct. Review is read-modify-write without a guard → double submit / concurrent submit double-applies. Naive-UTC timestamps. |
| Review stats | ⚠️ | "today" uses server-local `date.today()` vs UTC storage; streak uses `func.date`. |
| Anki / PDF export | ⚠️ | Filename from title is not sanitised (header injection / invalid chars); PDF built with default Latin-1 fonts (Unicode risk). |
| Dashboard / Lecture view / Graph / Aha / Knowledge map / Heatmap / Radar / Badges / Command palette / Theme | *unverified* | Components exist and the bundle builds; behaviour not browser-verified in this audit. |
| Activity heatmap | ⚠️ | Backed by `localStorage` (`activityLog`) only — device-local and **not cleared on logout**. |
| Tests / CI | ❌ | None existed. |

## 3. Defects

### Backend (P0/P1 first)
- **P0** Account takeover: `/auth/signup` attaches a chosen password to any existing passwordless account with that email; Google callback trusts unverified email.
- **P0** Default `JWT_SECRET` accepted when `ENVIRONMENT=production`.
- **P1** `study-path`, `knowledge-map` and `gaps` do not work without Neo4j (contradicts the portable-snapshot design).
- **P1** Pipeline retry/re-run duplicates flashcards; a `COMPLETED` lecture can be reprocessed.
- **P1** Upload storage: Supabase failure silently falls back to local disk even in deployments that require Supabase; local files are stored in a shared tmp dir and never removed.
- **P1** Fallback extractor invents prerequisite edges.
- **P1** Concept validation: duplicate IDs, empty names/definitions, invalid strength and invalid difficulty are not normalised; cycle handling destroys valid edges.
- **P2** Review endpoint not concurrency-safe; unknown `quality` values 1 and 4 are accepted although the UI uses 0/2/3/5.
- **P2** Export filenames unsanitised.
- **P2** Guest cleanup missing; `datetime.utcnow()` deprecated.
- **P3** `init_db` DDL duplicates Alembic.

### Frontend
- **P1** Axios 401 handler hard-redirects (`window.location.href`) for *every* failing request, causing repeated redirects and wiping the whole store.
- **P2** `activityLog` persists across accounts; presented as activity history.
- **P2** Review page: rating submit not guarded against double-click / key repeat.
- **P2** OAuth callback puts the JWT in the URL query (acceptable for redirect-based flows only if the page removes it immediately).
- *unverified*: accessibility of the D3 graph (no table alternative found in the file list), mobile behaviour, theme coverage of D3.

### API inconsistencies
- `GET /lectures/{id}/study-path` response lacks node details the UI needs when Neo4j is absent.
- `LectureStatusResponse` exposes `celery_task_id`.

### Security
- See P0 items. Additional: CORS hard-codes a production origin; no rate limiting on signup/login/upload; SessionMiddleware reuses `JWT_SECRET`; no upload MIME check.

### Deployment
- `docker-compose.yml`/`render.yaml` not validated in this pass (Docker availability unchecked).
- `backend/browser-verification.db` is committed to git (a database file; should be untracked).
- Windows/Celery `solo` pool not documented.

### Missing tests
All of them. This audit adds a backend pytest suite (see `docs/TESTING.md`).

## 4. Remediation plan

| Priority | Item |
|---|---|
| P0 | Fix account-linking / unverified-email takeover; enforce non-default JWT secret in production |
| P1 | Pure-Python graph algorithms (DAG, topo sort, prerequisites, gaps, study path, bridges) used whenever Neo4j is absent |
| P1 | Robust concept extraction (normalisation, bounded retries, chunking, honest fallback without invented edges) |
| P1 | Upload hardening and deterministic storage; idempotent pipeline |
| P2 | Safe review endpoint; export filename sanitation; guest cleanup |
| P2 | Frontend 401 handling, activity log scoping |
| P2 | CI + tests, docs |
| P3 | Visual redesign, accessibility table alternative for the graph, further D3 polish |
