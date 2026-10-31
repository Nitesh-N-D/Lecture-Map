# Production Deployment Checklist

Targets: Render (API, Docker, `render.yaml`) and Vercel (frontend, `frontend/vercel.json`). Nothing was deployed during this work. Pushing to `main` may trigger an automatic deploy if auto-deploy is enabled on either service; check both dashboards before pushing if you want to hold the release.

## Backend (Render) environment

Secrets are set in the Render dashboard only (`sync: false` in `render.yaml`). Never in git, never in Vercel.

| Variable | Required | Production value |
|---|---|---|
| `ENVIRONMENT` | yes | exactly `production` (a typo silently disables safeguards; unknown values are logged) |
| `FRONTEND_URL` | yes | public https URL(s) of the frontend. A comma-separated list is allowed; localhost entries are ignored in production |
| `BACKEND_URL` | yes | public https URL of this API, in the same order as `FRONTEND_URL` |
| `CORS_ORIGINS` | no | extra allowed origins |
| `JWT_SECRET` | yes | 32+ random characters (the app refuses to start otherwise; blueprint generates one) |
| `SESSION_SECRET` | no | separate OAuth cookie secret (blueprint generates one) |
| `KEY_ENCRYPTION_SECRET` | recommended | 32+ random characters; encrypts users' saved Gemini keys. Falls back to `JWT_SECRET`. Set it **before** users save keys: changing it later makes saved keys unreadable (users must re-enter them). Not declared in `render.yaml`, add it by hand |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google sign-in | from Google Cloud Console |
| `DATABASE_URL` | yes | Postgres URL (`postgresql+asyncpg://...`). For the Supabase pooler the user is `postgres.<project-ref>` |
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_KEY` | yes | the **secret** key `sb_secret_...` (or legacy `service_role` JWT). A publishable/anon key is refused and `/health` reports `storage_ok: false` |
| `SUPABASE_BUCKET` | yes | private bucket name, default `lecture-files` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | server default key and model; users may supply their own key in Settings |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | no | AuraDB (`neo4j+s://...`). Optional mirror; the JSON graph on each lecture is authoritative |
| `NEO4J_DATABASE` | no | database name if not the server default |
| `REDIS_URL` | only with `USE_CELERY=true` | Upstash `rediss://...` URL (TLS, certificate verified unless `?ssl_cert_reqs=CERT_NONE`) |
| `USE_CELERY` | yes | `false` on the free plan (lectures are processed in-process) |
| `TRUST_PROXY_HEADERS` | yes | `true` on Render (per-client rate limits) |
| `RATE_LIMIT_ENABLED` | yes | `true` |
| `ALLOW_LOCAL_STORAGE_FALLBACK` | no | leave unset in production: files would be written to the container's ephemeral disk |

For local development the same env file can list both: for example `FRONTEND_URL=http://localhost:5173,https://app.example.com` and `BACKEND_URL=http://localhost:8000,https://api.example.com`. The backend picks the entry matching the request host.

## Frontend (Vercel)

| Variable | Value |
|---|---|
| `VITE_API_URL` | the API URL (build time). Without it a production build calls the same origin |
| `VITE_SITE_URL` | optional, canonical site URL |

Nothing secret belongs here: every `VITE_` variable is embedded in the public JavaScript bundle.

Root directory `frontend`, framework preset Vite, build `npm run build`, output `dist`. Update hard-coded URLs in `index.html`, `public/robots.txt` and `public/sitemap.xml` if the domain differs.

## Supabase

1. Storage → create a **private** bucket named as in `SUPABASE_BUCKET`.
2. Project Settings → API Keys → copy the secret key (`sb_secret_...`) into Render's `SUPABASE_KEY`. Do not paste it into chat or commit it.
3. Objects are stored as `<user_id>/<lecture_id>.<ext>`; lecture deletion and account deletion remove them, and account deletion also sweeps stray objects under the user's prefix.
4. After deploying, `GET /health` must show `"storage": "supabase", "storage_ok": true`.

## Google Cloud Console

Authorised redirect URIs must match exactly, one per environment:
- `http://localhost:8000/auth/google/callback`
- `https://<api-host>/auth/google/callback`

## Database schema

This release adds `users.gemini_api_key_enc` (migration `004`) and the `review_logs` table (`005`). App startup creates missing tables and adds these columns automatically (additive only). Both migrations are idempotent, so `alembic upgrade head` is safe before or after the first boot. Verified on SQLite (`upgrade head → downgrade base → upgrade head`, and startup-first then upgrade); not yet run against Postgres.

## Before go-live

1. Back up the production database.
2. Run migrations against a staging Postgres first (`alembic upgrade head`).
3. Set `SUPABASE_KEY` to the secret key and confirm `/health` reports `storage_ok: true`.
4. Set `KEY_ENCRYPTION_SECRET` before users start saving Gemini keys.
5. Install `faster-whisper` in the image if audio/video is required (not verified) and confirm Render's free-tier memory is enough.
6. Rotate any secret that has ever been pasted into chat, a ticket or git history.
7. Test real Google sign-in on staging with both a new and an existing account.
8. Confirm the API returns 404 for `/docs` and `/openapi.json`.
9. Monitor `/health` and alert on 5xx (`request_id` ties user reports to logs).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Upload returns 503 "File storage is not configured" | `SUPABASE_URL`/`SUPABASE_KEY` missing in production |
| Upload fails, message mentions the secret key | `SUPABASE_KEY` is a publishable/anon key |
| Lecture stuck in Processing | `USE_CELERY=true` with no worker running; set it to `false` on the free plan |
| Lecture FAILED with a quota message | Gemini quota exhausted; wait, or the user adds their own key in Settings |
| Graph pages work but Neo4j logs a warning | Neo4j unreachable; the app keeps working from the JSON snapshot |
| Google sign-in returns `redirect_uri_mismatch` | `BACKEND_URL` + `/auth/google/callback` not registered exactly |

## Known limits

Single-process rate limiting; in-process background processing when `USE_CELERY=false`; free-tier cold starts delay the first request.
