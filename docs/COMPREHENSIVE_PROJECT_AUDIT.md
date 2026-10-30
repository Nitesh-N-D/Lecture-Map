# Comprehensive Project Audit

The earlier file-level audit is in `PROJECT_AUDIT.md`. This index ties the later findings together.

| Area | Where documented |
|---|---|
| Security findings and residual risks | `SECURITY_AUDIT.md` |
| Privacy, export, deletion, retention | `PRIVACY_AND_DATA_HANDLING.md` |
| Errors and recovery | `ERROR_HANDLING_AND_RECOVERY.md` |
| SEO | `SEO_IMPLEMENTATION.md` |
| Deployment | `PRODUCTION_DEPLOYMENT_CHECKLIST.md` |
| Design and accessibility (mostly not done) | `LECTUREMAP_DESIGN_SYSTEM.md` |
| What changed | `IMPLEMENTATION_CHANGELOG.md` |
| What was run, mocked, and untested | `TESTING_AND_VERIFICATION_REPORT.md` |

## Feature status

| Feature | Status |
|---|---|
| Email signup/login, logout revocation | VERIFIED (automated tests) |
| Guest sessions and purge | VERIFIED (automated tests) |
| Owner-scoped access to lectures, graphs, flashcards | VERIFIED (automated tests) |
| Study status rules and mastery | VERIFIED (unit and API tests) |
| Flashcard review concurrency | VERIFIED (tests) |
| Data export and account deletion | VERIFIED (API tests); UI PARTIALLY VERIFIED (jsdom only) |
| Security headers, limits, rate limiting | VERIFIED (tests, one live smoke run) |
| Dev/prod configuration | VERIFIED (subprocess tests, live dev run); production run with real https URLs not done |
| Migrations | VERIFIED on SQLite; Postgres BLOCKED (not tested) |
| Google login | PARTIALLY VERIFIED: redirect, PKCE parameters and Google discovery verified live; consent, code exchange and callback need an interactive sign-in |
| Frontend callback, Settings, SEO tags, accessibility basics | VERIFIED in a real browser (Playwright, 20 runs); screen readers and other browsers not tested |
| Gemini | VERIFIED live (after fixing the retired default model) |
| PDF extraction and pipeline end to end (extractive fallback) | VERIFIED (e2e) |
| Postgres, Supabase Storage, Neo4j, Redis | FAILED live checks: credentials or hosts in `.env` are invalid or unreachable |
| Whisper | BLOCKED (`faster-whisper` not installed) |
| Concept list alternative to the graph, retry button, skip link, focus styles | VERIFIED (e2e) |
| Full visual redesign of every page, Aha Path persistence | NOT DONE |
