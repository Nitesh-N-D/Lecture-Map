# Testing and Verification Report

Windows 11, Python 3.11.9 (project venv), Node via `frontend/node_modules`, Playwright Chromium installed into `frontend/.playwright-browsers` (git-ignored).

## Results

| Check | Command | Result |
|---|---|---|
| Backend tests | `python -m pytest` | **116 passed** (2026-10-31; storage, Neo4j/Redis config, progress and review-history tests added) |
| Frontend unit tests | `npm test` | **37 passed** (8 files; study path and dashboard progress added) |
| Browser end-to-end | `npm run e2e` | **26 passed, 1 skipped** (desktop, mobile Pixel 7 and tablet 820×1180 projects; the skipped one is the opt-in `SHOTS=1` screenshot sweep) |
| Frontend build | `npm run build` | passes |
| Compile / deps | `compileall`, `pip check` | clean |
| Migrations on SQLite | `alembic upgrade head`, `downgrade base`, `upgrade head` | passed through `005`; also passed when the app's startup schema shim ran first (`004`/`005` are idempotent) |
| Dependency audits | `npm audit`; `pip-audit` | 0 JS vulnerabilities; 3 Python findings with no available fix (see Security Audit) |

## End-to-end journeys (real browser, real API, throwaway SQLite)

The e2e backend runs with Gemini, Supabase, Neo4j and Redis blanked and a dummy Google client, so nothing external is contacted except Google's public OIDC discovery document. See `frontend/playwright.config.js`.

- **A** Landing page: title, indexable, canonical, axe WCAG 2.2 A/AA scan has no serious or critical violations. The 404 page is noindex. Private routes redirect.
- **B** Guest start, dashboard, sign out.
- **C** Signup, sign out, wrong password rejected, login. Duplicate email refused. Escape closes the dialog.
- **D** PDF upload processed by the real pipeline (extractive fallback: 8 concepts, 8 cards). Concept list. Viewing does not mark a concept studied. Explicit "Mark as studied" persists across a reload. Graph nodes carry status in accessible labels. Flashcards are generated. axe scan of the lecture page.
- **E** A fake PDF is rejected with a message.
- **F** Data export downloads the account's data. Account deletion works and the old credentials stop working.
- **G** The skip link is the first tab stop and moves focus. The upload zone works from the keyboard.
- **H** Google start redirects with `S256` PKCE, state, nonce and the configured redirect URI (the request to Google is aborted). A callback error code shows a message. A bad token in the URL fragment is rejected and the hash cleared.
- **I** Mobile viewport (Pixel 7) and tablet: no horizontal scroll, concept list reachable.
- **K** Theme choice persists across reloads; the Gemini key steps are shown; the graph's Aha Path tour can be paused, resumed, skipped and stopped.
- **L** Study path (desktop, mobile, tablet): start a path, pause, leave and come back without a query string (the session is restored and still paused), resume, complete every step, and the completed state survives a reload. No horizontal overflow.

Not covered by e2e: flashcard review submission through the UI, the knowledge map page, prerequisite ordering with real edges (the fixture has none without Gemini; covered by backend and unit tests), the retry button after a real failure, the upload progress UI, the multi-lecture graph, other browsers (Chromium only), screen readers.

## Live integration checks (`backend/scripts/live_integration_check.py`)

Uses `backend/.env`, prints PASS/FAIL only, writes one uniquely named test object or node and removes it. The database check is a read-only `SELECT 1`; no migration was run against it.

| Service | Result | Detail |
|---|---|---|
| Gemini | **PASS** | real extraction returned 9 concepts and 10 edges. The old default `gemini-2.0-flash` and also `gemini-2.5-flash` returned NotFound for this key ("no longer available to new users"). The default is now `gemini-3-flash-preview`, and errors give an actionable message |
| PostgreSQL (`DATABASE_URL`) | **FAIL** | the server answers "tenant/user not found": the pooler username or project reference in `DATABASE_URL` is wrong |
| Supabase Storage | **FAIL** | "Invalid API key" for the configured `SUPABASE_KEY` |
| Neo4j | **FAIL** | the host name does not resolve (the Aura instance was probably deleted or paused) |
| Redis (Upstash) | **FAIL** | the host name does not resolve (the database was probably deleted) |
| Google sign-in | **PARTIAL** | redirect and PKCE parameters verified in a real browser, and the backend fetched Google's real discovery document. The consent screen, code exchange and callback need an interactive sign-in and were not run |
| Whisper | NOT RUN | `faster-whisper` is not installed in the venv |

The four failures look like credential or infrastructure problems rather than code defects, but they mean the production data path (Postgres, Supabase, Neo4j) is **unverified**. Re-run the script after fixing the values.

## Mocked / test doubles

Backend Google tests use a mocked token exchange. Frontend unit tests use jsdom with stubbed network.

## Live verification with the owner's environment — 2026-10-31

Run with `backend/.env` (values never printed). Scratch backend on port 8020 with `ALLOW_LOCAL_STORAGE_FALLBACK=true` set for that process only; `.env` was not edited.

| Integration | Result | Evidence |
|---|---|---|
| PostgreSQL | VERIFIED | `scripts/live_integration_check.py` (`SELECT 1`); guest signup, upload, lecture/graph/flashcard reads, delete all succeeded |
| Gemini extraction | VERIFIED once, then BLOCKED | One full pipeline produced 12 concepts, 13 edges and 21 cards from the PDF fixture. Later runs hit `ResourceExhausted`; the UI showed the FAILED state with a clear message. Rate-limit retry back-off is now 6/15/30 s |
| Neo4j | VERIFIED | write + read of 2 nodes / 1 edge, test data removed |
| Redis | VERIFIED | ping |
| Supabase Storage | FAILED (configuration) | `SUPABASE_KEY` is an `sb_publishable_…` key: listing buckets returns `[]` and uploads fail with an RLS violation. The server needs the project's secret key. `supabase==2.4.3` also rejected the new key format, so `requirements.txt` now pins `supabase>=2.15,<3` and `websockets>=14,<16` (70 backend tests pass on that stack) |
| Google OAuth | PARTIALLY VERIFIED | `/auth/google` 302s to Google with PKCE and the configured Render callback. The consent/callback leg was not exercised (needs a real Google sign-in) |
| CORS | VERIFIED | preflight from the Vercel origin is allowed |

Browser journey on the real stack: guest start and upload worked, but processing ended FAILED on the Gemini quota, so the post-upload graph, Aha Path and review screens were not re-checked against live data. Local coverage: 20 Playwright journeys, 22 unit tests, and a 140-combination screenshot + axe sweep (page × theme × viewport), all clean.

## Final completion pass — 2026-10-31

Fixes found by tests during this pass:
- **Flaky mobile test, root cause found.** `uploadFixture` used `isVisible()`, which does not wait. On a slow first render it returned false, the "Add lecture" click was skipped and the upload input never appeared. It now waits with `expect(...).toBeVisible()`. It reproduced on the new tablet project and passes after the fix.
- **Aha Path tour cancelled by graph rebuilds.** The graph effect's cleanup stopped the tour whenever the graph re-rendered (resize, marking a concept studied). The tour now survives rebuilds and stops only on unmount or when fewer than two steps remain.
- **Study path** now supports start, pause/resume, skip, complete, undo, restore after refresh (per user and lecture, cleared on logout) and empty/completed/error states. It always loads the lecture's own graph.
- **Dashboard** shows server-computed totals (`/progress/summary`: total, completed, mastered, pending, per-lecture progress, continue link) and a heatmap from real review history (`/review/history`). On error it shows a retry instead of zeros.
- **Migrations 004/005** are now idempotent, because app startup may already have added the column/table.

Still requires live action by the owner (not verifiable from here):
- Supabase: set the secret `sb_secret_...` key in Render, then confirm `/health` shows `storage_ok: true` and do one real upload.
- Google: complete one real consent → callback sign-in on the deployed site.
- Gemini: the quota was exhausted on the last live run; re-check one real extraction.
- Postgres: run `alembic upgrade head` against staging and then production (after a backup).
- Whisper/audio: not installed or verified.
