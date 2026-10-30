# Implementation Changelog

Uncommitted working-tree changes. Earlier work (uploads, storage, pipeline, graph snapshot, study path, flashcard locking, export, audit notes) is described in `docs/PROJECT_AUDIT.md`; this file lists the later security, privacy, auth, dev/prod and test work.

## Backend
- **Sessions:** `users.token_version` (migration `003_user_token_version`), JWT claim `tv`, logout revokes all sessions, guest logout deletes the account.
- **Google OAuth:** PKCE `S256`, issuer/audience/verified-email checks, deactivated accounts blocked, safe account linking, token returned in URL fragment, redirect targets from config only.
- **Dev and prod:** `FRONTEND_URL` / `BACKEND_URL` accept comma-separated lists (matched to the request host); production ignores non-https and localhost entries and refuses to start without public https URLs; `/docs` off in production; unknown `ENVIRONMENT` warns; unknown env variables ignored.
- **Hardening middleware** (`app/middleware.py`): request ids, security headers, body-size limits, rate limiting, generic 500 handler. New settings: `RATE_LIMIT_ENABLED`, `TRUST_PROXY_HEADERS`.
- **Privacy:** `GET /auth/me/export`, `DELETE /auth/me` (confirmation plus password for password accounts).
- **Study status:** derived `unexplored | studied | mastered | blocked`; viewing never grants progress; mastery requires reviewed flashcards.
- **Flashcards:** optimistic-lock review, double-submit guard, UTC dates.
- **Exports:** safe unicode `Content-Disposition`.
- **Migrations:** fixed revision chain, SQLite compatibility, Postgres-only `DROP TYPE` guarded; `env.py` follows `DATABASE_URL`.
- **Dependencies:** upgraded vulnerable packages (see Security Audit); `requirements.txt` pinned to the tested versions.

## Frontend
- `AuthCallback` reads the token from the URL fragment, verifies it with `/auth/me`, scrubs the address bar, handles errors, and is StrictMode-safe.
- Shared `API_BASE`; token and 401 handling moved into the store (no hard redirects); `errorMessage` helper; new API methods (retry, unmark visited, export, delete account).
- **Settings page** (`/settings`): data download and account deletion; nav link "Privacy".
- Graph nodes show status by glyph and dashed outline as well as colour (check = studied, star = mastered, slashed circle = blocked), with status in the accessible label and a legend.
- SEO: `Seo` component, noindex for private routes, 404 page, updated `robots.txt`, security headers in `vercel.json`.
- Logout clears the activity log.
- Test tooling: Vitest, Testing Library, jsdom (`npm test`). Upgraded to Vite 8, Vitest 5, React Router 7.

## Config and repo
- `backend/.env.example`, `render.yaml`, `.gitignore` (uploads, local databases) updated.

## Not done (from the original brief)
- Full visual restyle of every page; Aha Path persistence and controls; richer concept fields.
- Orphan-upload sweeper; frontend ESLint; bundle splitting; full permanent/transient Gemini retry policy.

## Docs
- README updated (dev/prod, tests, new endpoints); both `.env.example` files document the multi-URL syntax and `VITE_SITE_URL`.

## Later pass (redesign foundation, e2e, live checks)
- Gemini default model changed to `gemini-3-flash-preview` (older defaults return NotFound for new keys). Gemini failures now give actionable messages without leaking keys.
- `backend/scripts/live_integration_check.py`: PASS/FAIL live smoke checks (Gemini, Postgres read-only, Supabase, Neo4j, Redis).
- Frontend: design tokens, focus-visible styles, reduced motion, skip link, darker tertiary text, `ConceptList` tab, tab and dialog ARIA, keyboard-operable upload zone, "Retry processing" button.
- Playwright e2e suite (`frontend/e2e`, `npm run e2e`) with axe checks. Unit tests for the concept list and Gemini messages.
