# LectureMap

LectureMap turns uploaded lecture recordings and text-based PDFs into a personal study workspace.

## What it supports

- Audio and video files: MP3, MP4, WAV, M4A, WEBM, and OGG
- Text-based PDF files
- Email/password accounts and disposable guest sessions
- Clear upload and processing errors.

YouTube imports are intentionally not part of this project.

## Recommended production data setup

Use **Supabase Postgres** as the system of record and **Supabase Storage** for uploaded files. It keeps relational data and files in one managed product. Neo4j Aura is optional and only powers graph traversal/storage.

| Service | Purpose | Required | Setup |
| --- | --- | --- | --- |
| [Supabase](https://supabase.com) | Postgres database and file storage | Recommended for deployment | Create a project, database, and private lecture-files bucket |
| [Google AI Studio](https://aistudio.google.com/app/apikey) | Gemini concept and flashcard generation | Yes for completed study material | Create a Gemini API key |
| [Neo4j Aura](https://neo4j.com/cloud/platform/aura-graph-database/) | Concept graph persistence and traversal | Yes for graph views | Create an AuraDB Free instance |
| [Upstash](https://upstash.com) | Redis queue, only when USE_CELERY=true | Optional | Not needed for the default in-process workflow |

Supabase's free tier currently includes a 500 MB database and 1 GB of storage, but free projects pause after one week without activity. See [Supabase pricing](https://supabase.com/pricing).

## Local development

### Backend

    cd backend
    python -m venv venv
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    Copy-Item .env.example .env
    python -m uvicorn app.main:app --reload --port 8000

The default backend database is SQLite, so guest mode and authentication work immediately. Add real provider credentials to backend/.env before processing a genuine lecture.

### Frontend

    cd frontend
    npm install
    Copy-Item .env.example .env
    npm run dev

Open http://127.0.0.1:5173.

## Environment variables

Copy backend/.env.example to backend/.env. The important settings are:

    DATABASE_URL=sqlite+aiosqlite:///./lecturemap.db
    SUPABASE_URL=
    SUPABASE_KEY=
    SUPABASE_BUCKET=lecture-files
    GEMINI_API_KEY=
    NEO4J_URI=
    NEO4J_USERNAME=neo4j
    NEO4J_PASSWORD=
    USE_CELERY=false
    JWT_SECRET=replace-with-a-long-random-production-secret
    FRONTEND_URL=http://localhost:5173

Do not expose Supabase, Gemini, Neo4j, or JWT secrets in the frontend. The frontend only needs VITE_API_URL.

## Processing flow

    Upload audio/video/PDF
            |
    FastAPI validates and stores the file
            |
    PDF text extraction or Whisper transcription
            |
    Gemini extracts concepts and generates flashcards
            |
    Neo4j stores concept dependencies
            |
    Dashboard shows completed material or the saved error

A valid file works locally without Gemini or Neo4j: LectureMap builds an extractive concept map and starter flashcards from the uploaded text. Configure Gemini for richer AI-generated concepts/cards and Neo4j for graph traversal and cross-lecture graph persistence.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | /auth/signup | Create an email/password account |
| POST | /auth/login | Sign in |
| POST | /auth/guest | Create a guest session |
| POST | /auth/logout | End a guest session and invalidate it |
| GET | /auth/me | Read current user |
| GET | /auth/google | Start Google sign-in |
| GET | /auth/me/export | Download all your data (JSON) |
| DELETE | /auth/me | Delete your account and data |
| POST | /lectures/upload | Upload supported audio, video, or PDF files |
| GET | /lectures/{id}/status | Read progress or failure reason |
| GET | /lectures/{id}/graph | Read the concept graph |
| GET | /review/due | Read due flashcards |
| GET | /export/anki/{id} | Download Anki deck |
| GET | /export/pdf/{id} | Download a PDF export |

## Development and production

One backend `.env` can serve both. `FRONTEND_URL` and `BACKEND_URL` accept comma-separated lists in the same order (for example localhost first, then the deployed https URL); the entry matching the request host is used. With `ENVIRONMENT=production` only public https entries are accepted, `/docs` is disabled and a strong `JWT_SECRET` is required. Google sign-in needs `{BACKEND_URL}/auth/google/callback` registered as an authorised redirect URI for each environment. See `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`.

## Verification

    cd backend
    python -m pytest
    python -m compileall -q app

    cd ..\frontend
    npm test
    npm run build
    npx playwright install chromium   # once
    npm run e2e

    cd ..ackend
    python scripts/live_integration_check.py   # optional, uses backend/.env

Current results and what is not yet verified (live Google, Gemini, Whisper, Postgres, browser e2e) are in `docs/TESTING_AND_VERIFICATION_REPORT.md`. Security, privacy, SEO and error-handling notes are in `docs/`.

## Deployment

Deploy the frontend as a Vite project with frontend/vercel.json. Deploy the FastAPI backend on a persistent Python host. Configure all backend variables there, set FRONTEND_URL to the deployed frontend URL, and set VITE_API_URL to the backend URL.

## Privacy

The in-app privacy policy is available at /privacy. Guest accounts and their associated records are deleted on guest sign-out.

## License

MIT
