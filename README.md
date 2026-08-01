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

A valid file still requires Gemini and Neo4j credentials to finish the full graph workflow. Missing credentials produce a visible FAILED status with a useful reason.

## API overview

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | /auth/signup | Create an email/password account |
| POST | /auth/login | Sign in |
| POST | /auth/guest | Create a guest session |
| POST | /auth/logout | End a guest session and invalidate it |
| GET | /auth/me | Read current user |
| POST | /lectures/upload | Upload supported audio, video, or PDF files |
| GET | /lectures/{id}/status | Read progress or failure reason |
| GET | /lectures/{id}/graph | Read the concept graph |
| GET | /review/due | Read due flashcards |
| GET | /export/anki/{id} | Download Anki deck |
| GET | /export/pdf/{id} | Download a PDF export |

## Verification

    cd frontend
    npm run build
    npx agent-browser open http://127.0.0.1:5173
    npx agent-browser snapshot -i
    npx agent-browser close

    cd ..\backend
    python -m compileall app

## Deployment

Deploy the frontend as a Vite project with frontend/vercel.json. Deploy the FastAPI backend on a persistent Python host. Configure all backend variables there, set FRONTEND_URL to the deployed frontend URL, and set VITE_API_URL to the backend URL.

## Privacy

The in-app privacy policy is available at /privacy. Guest accounts and their associated records are deleted on guest sign-out.

## License

MIT
