# Production Deployment Checklist

Targets: Render (API, Docker, `render.yaml`) and Vercel (frontend, `frontend/vercel.json`). Nothing was deployed during this work.

## Backend (Render) environment

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | exactly `production` (a typo silently disables safeguards; the app logs a warning for unknown values) |
| `FRONTEND_URL` | public https URL(s) of the frontend. A comma-separated list is allowed; localhost entries are ignored in production |
| `BACKEND_URL` | public https URL of this API, in the same order as `FRONTEND_URL` |
| `CORS_ORIGINS` | extra allowed origins, optional |
| `JWT_SECRET` | 32+ random characters (the app refuses to start otherwise) |
| `SESSION_SECRET` | optional separate secret (blueprint generates one) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |
| `DATABASE_URL` | Postgres URL (`postgresql+asyncpg://...`) |
| `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_BUCKET` | file storage |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | extraction |
| `TRUST_PROXY_HEADERS` | `true` on Render (enables per-client rate limits) |
| `RATE_LIMIT_ENABLED` | `true` |

For local development, the same env file can keep both entries: for example `FRONTEND_URL=http://localhost:5173,https://app.example.com` and `BACKEND_URL=http://localhost:8000,https://api.example.com`. The backend picks the entry matching the request host.

## Google Cloud Console

Authorised redirect URIs must match exactly, one per environment:
- `http://localhost:8000/auth/google/callback`
- `https://<api-host>/auth/google/callback`

## Frontend (Vercel)

- Set `VITE_API_URL` to the API URL **at build time**. A production build without it uses same-origin API calls.
- Optional `VITE_SITE_URL` for canonical URLs.
- Update hard-coded URLs in `index.html`, `robots.txt`, `sitemap.xml` if the domain differs.

## Before go-live

1. Run migrations against a staging Postgres (`alembic upgrade head`). Only SQLite has been tested; Postgres is unverified.
2. Back up the production database first. Migration 003 adds `users.token_version` (all existing sessions stay valid because the default is 0; logging out bumps it).
3. Decide on `backend/browser-verification.db` (tracked in git; see Security Audit).
4. Install `faster-whisper` in the image if audio/video is required (not verified here) and confirm Render's free-tier memory is enough.
5. Rotate any secret that has ever been pasted into chat, a ticket or git history.
6. Test real Google sign-in on staging with both a new and an existing account.
7. Confirm the API returns 404 for `/docs` and `/openapi.json`.
8. Add monitoring for `/health` and log alerts on 5xx (`request_id` ties user reports to logs).

## Known limits

Single-process rate limiting; in-process background processing when `USE_CELERY=false`; no orphan-file sweeper; Free-tier cold starts delay the first request.
