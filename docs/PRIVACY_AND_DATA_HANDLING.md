# Privacy and Data Handling

This describes what the code does today. It is not legal advice, and the public privacy page (`frontend/src/pages/Privacy.jsx`) should be reviewed by the operator before launch.

## Data stored

| Data | Where | Purpose |
|---|---|---|
| Account: email, name, avatar URL, Google subject id, password hash (never the password), role, session version | `users` table | Sign-in, session revocation |
| Lectures: title, status, transcript, concept graph snapshot, studied concept ids | `lectures` table | The product itself |
| Flashcards and review schedule | `flashcards` table | Spaced repetition |
| Uploaded source file | Supabase Storage bucket, or local `UPLOAD_DIR` | Processing and retries |
| Optional graph copy | Neo4j (if configured) | Mirror of the graph; the database snapshot is authoritative |

## Third parties that receive content

- **Google Gemini** (if `GEMINI_API_KEY` is set) receives transcript or document text for concept extraction.
- **Supabase** (if configured) stores files and may host the database.
- **Google** receives sign-in requests when a user chooses Google login.

No analytics or advertising trackers are present in the code, so no analytics consent banner is implemented.

## User controls (implemented)

- **Export:** Settings > "Download my data" calls `GET /auth/me/export` and downloads JSON: account, lectures, transcripts, graphs, studied ids, flashcards. Uploaded source files are not included.
- **Delete lecture:** `DELETE /lectures/{id}` removes the row, its flashcards and the stored file.
- **Delete account:** Settings > "Delete account" calls `DELETE /auth/me`. It requires typing `DELETE` and, for accounts with a password, the current password. It removes the user, all lectures, flashcards, Neo4j graphs (best effort) and stored files.
- **Sign out everywhere:** logout invalidates every session of the account.
- **Guests:** guest accounts and their data are purged after `GUEST_RETENTION_HOURS` (default 48) and immediately on guest logout.

## Retention, stated honestly

- Data is kept until the user deletes it. There is no automatic expiry for registered accounts.
- File deletion happens after the database commit; if storage is unreachable at that moment the database record is gone but the file may remain. Operators should check the bucket periodically (an orphan sweeper is not implemented).
- Database backups and Supabase platform backups are outside this application's control, so deleted data may persist there for the provider's retention period.
- Data already sent to Gemini is governed by Google's terms, and LectureMap cannot recall it.
- Server logs may include request paths, request ids and client IPs; they never include request bodies or tokens by design (not independently audited).

## Browser storage

`localStorage` key `lecturemap-store` holds the session token, user profile and a per-day activity counter. It is cleared on logout and on server-side session invalidation. The Google token only appears in the URL fragment for one navigation and is removed immediately.

## Gaps

- No cookie/analytics consent mechanism is needed today; add one before introducing analytics.
- No scheduled deletion of inactive registered accounts.
- No admin tooling for data subject requests; the in-app export and delete are the supported route.
