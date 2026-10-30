# Testing and Verification Report

Windows 11, Python 3.11.9 (project venv), Node via `frontend/node_modules`, Playwright Chromium installed into `frontend/.playwright-browsers` (git-ignored).

## Results

| Check | Command | Result |
|---|---|---|
| Backend tests | `python -m pytest` | **69 passed**, 7 third-party deprecation warnings |
| Frontend unit tests | `npm test` | **22 passed** (6 files) |
| Browser end-to-end | `npm run e2e` | **20 passed** (19 desktop Chromium journeys + 1 mobile viewport run) |
| Frontend build | `npm run build` | passes |
| Compile / deps | `compileall`, `pip check` | clean |
| Migrations on SQLite | `alembic upgrade head`, `downgrade base`, `upgrade head` | passed through `003` |
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
- **I** Mobile viewport (Pixel 7): no horizontal scroll, concept list reachable.

Not covered by e2e: flashcard review submission through the UI, the study path page, the knowledge map page, the retry button after a real failure, the upload progress UI, the multi-lecture graph, other browsers (Chromium only), screen readers.

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
