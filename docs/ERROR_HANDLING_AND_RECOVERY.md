# Error Handling and Recovery

## API

- Every response carries `X-Request-ID` (a client-supplied id is echoed only if it is 8 to 64 safe characters, otherwise a new one is generated).
- Expected errors use FastAPI's `{"detail": "..."}`. Middleware errors (413, 429) and unhandled exceptions add `request_id`.
- Unhandled exceptions return HTTP 500 with a generic message and the `request_id`; the stack trace is only in server logs.
- 429 responses include `Retry-After`.

## Frontend

- `errorMessage(err)` in `src/api/client.js` converts failures into user text: network failure, timeout, API `detail`, wait-and-retry for 429, and a short reference (first 8 characters of `request_id`) for 5xx errors. Adopted so far by the Settings page; older pages still show their own messages.
- A 401 on a request that carried a token signs the user out through the store; route guards then return them to the landing page. No hard reloads, so no redirect loops. Failed logins never trigger it.
- `ErrorBoundary` wraps all routes (existing).
- Google sign-in failures return to `/?auth_error=<code>`; codes: `google_oauth_failed`, `google_identity_unavailable`, `account_deactivated`.
- Unknown URLs render a 404 page (noindex) instead of silently redirecting.

## Lecture processing recovery

- Processing is claimed atomically (PENDING or FAILED to PROCESSING), so duplicate workers cannot run one lecture twice.
- Flashcards are replaced on reprocess, never appended.
- On startup, lectures left PENDING or PROCESSING by a dead process are marked FAILED with a retry available (`POST /lectures/{id}/retry`; the client has `api.retryLecture`, but no retry button was added to the UI in this pass).
- Retry returns 409 when there is no stored upload to process.

## Known gaps

- Gemini errors are not classified into permanent versus transient causes with bounded retries.
- Orphaned uploads (file stored, database insert failed) are not swept.
- Frontend pages other than Settings have not been moved to `errorMessage`.
