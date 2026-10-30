# Security Audit

Scope: the repository as of this change set. Findings marked **Fixed** have automated tests unless noted.

## Fixed in this pass

| Area | Issue | Fix |
|---|---|---|
| Sessions | Logout could not revoke a stolen JWT | `users.token_version` embedded as `tv`; logout and account linking bump it; mismatched tokens get 401 |
| Google OAuth | Token delivered in the URL query (logs, history, referrers) | Token is sent in the URL fragment; the frontend reads it once and clears the address bar |
| Google OAuth | No PKCE, no issuer/audience defence in depth | `S256` PKCE, explicit issuer and audience checks, verified-email required (`email_verified is True`) |
| Account takeover | Existing password account could be linked by Google | Linking drops the unverified password and revokes old sessions; signup never attaches to an existing email |
| Redirects | Open redirect risk | Callback and login redirect targets come only from configuration, never request parameters (tested) |
| Deactivated users | Could sign in through Google | Blocked in the Google callback |
| CORS | Hard-coded origin, localhost allowed in production | Origins come from `FRONTEND_URL` / `CORS_ORIGINS`; localhost only outside production |
| Production config | Weak default `JWT_SECRET`, localhost URLs | Startup refuses weak secret and URLs without a public https entry |
| Docs exposure | `/docs`, `/openapi.json` public | Disabled when `ENVIRONMENT=production` |
| Headers | None | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP (`default-src 'none'`), HSTS in production, `Cache-Control: no-store` on `/auth` and `/export` |
| Abuse | No rate limits | Per-client sliding window: login/signup 10 per minute, guest 10 per minute, Google start 20 per minute, uploads 20 per hour, reviews 120 per minute |
| Request size | Unbounded bodies | 1 MiB limit for JSON, `MAX_UPLOAD_MB` plus 1 MiB for uploads, checked from `Content-Length` before parsing |
| Errors | Internals could leak | Unhandled errors return a generic message with a `request_id`; details go to server logs only |
| Content-Disposition | Header injection / unicode filenames | ASCII fallback plus RFC 5987 name; control characters stripped |
| Frontend 401 | Any failing request wiped storage and hard-redirected | Single store-based sign-out, only when a token was sent |
| Frontend persistence | Activity log survived logout | Cleared on logout; only session and activity are persisted |
| Dependencies | Known vulnerabilities | Upgraded `fastapi`, `starlette`, `python-multipart`, `authlib`, `python-jose`, `python-dotenv`, `pypdf` (pdf parser for untrusted uploads), `react-router-dom`, `vite`, `vitest`, `@vitejs/plugin-react` |
| Settings | Unknown env variables crashed startup | Ignored, so hosts that add variables (for example `PYTHON_VERSION`) cannot break boot |

## Residual risks (open)

1. **`python-jose` 3.5.0 (PYSEC-2026-4298) and `ecdsa` 0.19.2 (PYSEC-2026-1325): no fixed version published.** The app signs with HS256 only, which does not use `ecdsa`. Recommended: migrate token handling to PyJWT.
2. **`protobuf` 4.25.9 (PYSEC-2026-1805)** is held back by `google-generativeai==0.5.4`. Upgrading that SDK needs its own testing against Gemini, which could not be done here.
3. **Rate limiting is per process.** With several API replicas the effective limit multiplies; use an edge limiter or Redis for scale-out. Client IP comes from `X-Forwarded-For` only when `TRUST_PROXY_HEADERS=true`, which must only be set behind a trusted proxy.
4. **Body-size limit relies on `Content-Length`.** A chunked request without that header is not capped by this middleware; the upload route additionally validates size while saving. Set a body limit at the proxy as well.
5. **JWT lives in `localStorage`** (existing design). Any XSS would expose it. The frontend sends no inline scripts of its own, but there is no CSP on the static host beyond the headers in `vercel.json`, which do not yet include a `Content-Security-Policy` (the SPA loads Google Fonts or inline styles; verify before tightening). Moving to an HttpOnly cookie plus CSRF protection would be a larger change.
6. **Google OAuth is untested against Google.** See the Testing report.
7. **No email verification for password signups.** Mitigated by never linking password and Google identities on an unverified email (see above).
8. **Tracked file `backend/browser-verification.db`** is a SQLite database committed to git. Contents were not inspected. Review it and remove it from history if it holds real data (not done; deleting needs your approval).
9. **`ENVIRONMENT` in the local `.env` is misspelled** (`developement`). It behaves as development and the app now logs a warning, but production safeguards only apply when the value is exactly `production`.
10. **Secrets hygiene:** `.env` is git-ignored. Values were never printed during this work. If any secret was ever committed or pasted elsewhere, rotate it.

## Not audited

Neo4j query construction, Supabase bucket policies, Render and Vercel account settings, the Docker image contents, and a full OWASP ASVS pass.
