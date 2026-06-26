# 🗺️ LectureMap

> Transform any lecture audio or video into an interactive D3.js knowledge graph with spaced repetition flashcards.

**The core differentiator:** LectureMap builds a prerequisite dependency graph — not just a list of topics. Arrows show which concepts must be mastered before others. Knowledge gaps glow red in real-time.


---

## Preview

![LectureMap preview](frontend/public/og-image.png)

The core experience:
- **Landing page** — live animated D3 demo graph (MIT 6.006 sample), feature highlights, competitor comparison table
- **Dashboard** — all lectures as cards with status, progress ring, and quick stats
- **LectureView** — full-screen interactive force-directed concept graph with a slide-out node detail panel
- **Review** — flip-animation flashcards with SM-2 rating buttons (Again / Hard / Good / Easy)

---

## Features

| Feature | Description |
|---------|-------------|
| 🕸️ **Concept Dependency Graph** | D3.js force-directed graph with directional arrows showing prerequisite relationships |
| 🔴 **Gap Detection** | Unvisited prerequisite nodes pulse red — know exactly what you're missing |
| 🎙️ **Audio/Video Upload** | Drop `.mp3 .mp4 .wav .m4a .webm` or paste a YouTube URL |
| 🤖 **Whisper Transcription** | Async `faster-whisper` transcription via Celery worker |
| 🧠 **Gemini Flash AI** | Extracts 15–30 concepts + prerequisite edges from transcript |
| 🗄️ **Neo4j Graph DB** | Stores concept nodes + edges, cross-lecture linking |
| 🃏 **SM-2 Flashcards** | Gemini-generated Q&A cards scheduled by spaced repetition |
| 📤 **Export** | Anki `.apkg` and PDF export |
| 🔐 **Auth** | Email/password, Google OAuth, and anonymous guest mode — all three converge on the same account if emails match |
| ▶️ **Aha Path flythrough** | Animated camera tour through the graph in prerequisite-first learning order |
| 🧩 **Knowledge Map** | Merges every completed lecture into one graph, auto-linking identically named concepts across courses |
| 🔥 **Mastery heatmap** | GitHub-contributions-style calendar of daily review activity |
| 🎯 **Concept radar** | Per-lecture mastery breakdown by difficulty tier, rendered as a hand-built SVG radar chart |
| 🏆 **Mastery badges** | Earn a badge per difficulty tier once every concept in it is marked studied |
| ⌘K **Command palette** | Jump to any lecture, concept, or action instantly from anywhere in the app |
| ⌨️ **Keyboard-first review** | Space to flip, `0/2/3/5` to rate — review a whole deck without touching the mouse |
| 🌗 **Dark mode** | Full app-wide theming via CSS custom properties, including the D3 graph itself |
| 🛡️ **Error boundaries** | Graceful, recoverable fallback UI instead of a blank screen on render errors |

---

## What makes this different

A few of the features above are easy to miss in a feature table, so here's
what they actually do and why they exist:

**Aha Path flythrough** — Most concept-map tools show you a static diagram
and leave you to figure out where to start. LectureMap topologically sorts
the graph by its prerequisite edges, then animates the camera to each
concept in that exact order, panning and pulsing each node as it goes.
It turns a dependency diagram into a guided "here's the order you'd
actually learn this in" tour. Click **▶ Aha Path** in the graph toolbar.

**Knowledge Map** — Once you have two or more completed lectures,
`GET /knowledge-map` merges all of their concept graphs into one, and
auto-detects identically named concepts across different lectures
(e.g. "Recursion" taught in two different courses) and draws a dashed
gold bridge edge between them. This is the only place you can see your
*entire* personal curriculum as a single connected map instead of
isolated per-lecture islands.

**Mastery heatmap, radar, and badges** — All three are derived entirely
from data you already have (visited concepts + review timestamps) with
no extra backend aggregation required for the heatmap, which is logged
client-side as you review. They turn "I studied some stuff" into a
visible, motivating record of progress.

---

## Tech Stack

### Backend
- **FastAPI** + Uvicorn
- **Celery** + Redis (Upstash) — async task queue
- **PostgreSQL** (Supabase) + SQLAlchemy async
- **Neo4j Aura Free** — graph database
- **faster-whisper** — local Whisper transcription
- **yt-dlp** — YouTube audio extraction
- **Gemini Flash** — concept extraction + flashcard generation
- **SM-2 algorithm** — spaced repetition scheduling

### Frontend
- **React 18** + Vite
- **D3.js v7** — force-directed graph
- **TailwindCSS v3**
- **Zustand** — state management
- **React Router v6**

---

## Local Development

### Prerequisites
- Docker + Docker Compose (recommended — runs everything with one command)
- *or* Node.js 18+ and Python 3.11+ for a manual setup
- API keys: Gemini, Supabase, Neo4j Aura Free

### Option A — One command with Docker Compose (recommended)

```bash
git clone https://github.com/yourname/lecturemap
cd lecturemap

cp backend/.env.example backend/.env     # then fill in your real API keys
cp frontend/.env.example frontend/.env   # defaults already point at localhost:8000

docker compose up --build
```

This starts **five** services together: Postgres, Redis, the FastAPI API,
the Celery worker, and the Vite dev server — all networked correctly out
of the box. Open [http://localhost:5173](http://localhost:5173).

Neo4j is intentionally *not* included in Docker Compose — point
`NEO4J_URI` in `backend/.env` at a free [Neo4j Aura](https://neo4j.com/cloud/aura-free/)
instance instead; there's no practical local equivalent worth maintaining
for a free-tier-first project.

To stop everything: `docker compose down` (add `-v` to also wipe the
Postgres volume).

### Option B — Manual setup (no Docker)

**1. Infrastructure** — either run Postgres + Redis yourself, or just the
infra services from compose:
```bash
docker compose up -d postgres redis
```

**2. Backend**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

cp .env.example .env  # then fill in your real API keys
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**3. Celery worker** (separate terminal)
```bash
cd backend
source venv/bin/activate
celery -A app.celery_app worker --loglevel=info --concurrency=2
```

**4. Frontend** (separate terminal)
```bash
cd frontend
npm install
cp .env.example .env  # defaults already point at localhost:8000
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Environment Variables

### Backend (`backend/.env`)

```env
# PostgreSQL (Supabase)
DATABASE_URL=postgresql+asyncpg://user:pass@db.supabase.co:5432/postgres

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_BUCKET=lecture-files

# Neo4j Aura Free
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Redis (Upstash)
REDIS_URL=redis://default:password@your-instance.upstash.io:6379

# AI
GEMINI_API_KEY=your-gemini-api-key

# Auth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
JWT_SECRET=your-256-bit-random-secret
FRONTEND_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:8000
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/signup` | Create account with email + password |
| `POST` | `/auth/login` | Sign in with email + password |
| `POST` | `/auth/guest` | Create guest session |
| `GET` | `/auth/google` | Google OAuth redirect |
| `GET` | `/auth/google/callback` | Google OAuth callback (creates/links account, issues JWT) |
| `GET` | `/auth/me` | Current user |
| `POST` | `/lectures/upload` | Upload audio/video file |
| `POST` | `/lectures/youtube` | Add YouTube URL |
| `GET` | `/lectures` | List user lectures |
| `GET` | `/lectures/{id}/status` | Poll processing status |
| `GET` | `/lectures/{id}/graph` | Get concept graph |
| `GET` | `/lectures/{id}/graph/gaps` | Get knowledge gaps |
| `GET` | `/lectures/{id}/study-path?target={concept_id}` | Ordered prerequisite path to a target concept |
| `GET` | `/knowledge-map` | Unified cross-lecture graph with shared-concept bridges |
| `POST` | `/concepts/{id}/visit` | Mark concept studied |
| `GET` | `/review/due` | Cards due for review |
| `POST` | `/review/{card_id}` | Submit SM-2 rating |
| `GET` | `/review/stats` | Review statistics |
| `GET` | `/export/anki/{id}` | Download Anki deck |
| `GET` | `/export/pdf/{id}` | Download PDF |

---

## Architecture

```
User uploads lecture
        ↓
FastAPI → Supabase Storage (file) or yt-dlp (YouTube)
        ↓
Celery Task (Redis queue)
  Step 1: Download audio
  Step 2: faster-whisper → transcript
  Step 3: Gemini Flash → concepts + prerequisite edges (JSON)
  Step 4: Neo4j Aura → store concept nodes + dependency edges
  Step 5: Gemini Flash → Q&A flashcards per concept → PostgreSQL
        ↓
React polls /status every 3s
        ↓
On COMPLETE: redirect to LectureView
  → D3.js renders force-directed graph
  → Click node → NodePanel (definition, prerequisites, dependents)
  → Gap detection: red pulsing nodes for unvisited prerequisites
  → Flashcard tab: SM-2 spaced repetition review queue
```

---

## Authentication

Three sign-in paths, all converging on the same `User` row when emails match:

- **Email + password** — `POST /auth/signup` hashes the password with
  bcrypt (`passlib`) before storage; `POST /auth/login` verifies it.
  Passwords must be 8+ characters.
- **Google OAuth** — `GET /auth/google` redirects to Google; the callback
  creates the user (or links to an existing email match) and issues a JWT.
- **Guest mode** — `POST /auth/guest` creates an ephemeral account with a
  24-hour token and no email at all, for the zero-friction "try it now"
  flow on the landing page.

**Account linking is automatic and non-destructive.** If you sign up with
Google using `you@example.com` and later create a password for the same
email, `/auth/signup` detects the existing Google-linked row and *adds* a
password to it rather than creating a duplicate account — so either
method logs you into the same lectures and flashcards afterward. The
reverse direction works too: Google sign-in looks up by `google_id`
first, then falls back to matching by email if no Google ID is on file
yet, and links it.

Frontend-wise, `AuthModal` (used on both the Navbar and Landing page)
handles email/password in one form with a mode toggle, links out to the
Google OAuth redirect, and offers guest mode as a fallback — all three
end with the same `setAuth()` call into the Zustand store, so the rest of
the app never needs to know which method was used.

---

## SM-2 Algorithm

The SM-2 implementation follows the original Anki specification exactly:

```
quality 0: complete blackout
quality 1: incorrect, remembered on seeing answer
quality 2: incorrect, easy recall on seeing answer
quality 3: correct with significant difficulty
quality 4: correct after hesitation
quality 5: perfect response

if quality < 3:
    repetitions = 0; interval = 1
else:
    if rep 0: interval = 1
    if rep 1: interval = 6
    else: interval = round(interval × EF)
    repetitions += 1

EF = EF + (0.1 - (5-q) × (0.08 + (5-q) × 0.02))
EF = max(1.3, EF)
next_review = now + interval_days
```

---

## Deployment

### Backend + worker → Render (via Blueprint)

This repo includes [`render.yaml`](./render.yaml), a Render Blueprint that
defines both the API web service and the Celery worker in one file:

1. Push the repo to GitHub.
2. In Render: **New** → **Blueprint** → connect the repo → Render reads
   `render.yaml` and proposes both `lecturemap-api` and `lecturemap-worker`.
3. Render will prompt you to fill in every env var marked `sync: false`
   (Supabase, Neo4j, Redis, Gemini, Google OAuth, `FRONTEND_URL`) —
   `JWT_SECRET` is auto-generated for you.
4. Deploy. The API's health check hits `/health`, so Render won't mark it
   live until FastAPI actually boots successfully.

**Manual alternative** (no Blueprint): New Web Service pointed at
`backend/` with build command `pip install -r requirements.txt` and start
command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, plus a
separate Background Worker with start command
`celery -A app.celery_app worker --loglevel=info`.

### Frontend → Vercel

This repo includes [`frontend/vercel.json`](./frontend/vercel.json),
which sets the Vite build output directory and — critically — adds a
catch-all rewrite to `index.html` so client-side routes like
`/dashboard` or `/lectures/abc123` don't 404 on a hard refresh.

1. Import the repo in Vercel, set **Root Directory** to `frontend`.
2. Framework preset: Vite (auto-detected via `vercel.json`).
3. Add environment variable: `VITE_API_URL=https://your-render-app.onrender.com`
4. Deploy.

After both are live, set `FRONTEND_URL` on the Render API service to your
real Vercel URL (e.g. `https://lecturemap.vercel.app`) so CORS and the
Google OAuth redirect both resolve correctly — redeploy the API after
changing it.

---

## SEO & Search Console Setup

The frontend ships with a complete SEO baseline:

| Asset | Path | Purpose |
|-------|------|---------|
| Favicons (ICO, PNG ×4, SVG) | `frontend/public/favicon*` | Browser tabs, bookmarks |
| Apple touch icon | `frontend/public/apple-touch-icon.png` | iOS home screen |
| Android/maskable icons | `frontend/public/android-chrome-*.png`, `maskable-icon-512x512.png` | PWA install, Android adaptive icons |
| Web app manifest | `frontend/public/site.webmanifest` | PWA metadata |
| Open Graph image | `frontend/public/og-image.png` | Link previews on Slack/Discord/iMessage |
| `robots.txt` | `frontend/public/robots.txt` | Crawler rules — only `/` is indexable; app routes are disallowed |
| `sitemap.xml` | `frontend/public/sitemap.xml` | Search engine sitemap |
| JSON-LD structured data | inline in `index.html` | Rich results (SoftwareApplication schema) |

### Connecting Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console) → **Add property** → enter `https://lecturemap.app` (use your real production domain).
2. Choose **HTML tag** verification and copy the `content="..."` value Google gives you.
3. Open `frontend/index.html` and replace:
   ```html
   <meta name="google-site-verification" content="REPLACE_WITH_YOUR_GOOGLE_SITE_VERIFICATION_CODE" />
   ```
   with the real code.
4. *(Alternative method)* — rename `frontend/public/googleXXXXXXXXXXXXXXXX.html` to the exact filename Search Console provides (e.g. `google1a2b3c4d5e6f7g8h.html`) and update its single line of content to match. You only need **one** of the two verification methods, not both.
5. Update every `https://lecturemap.app` reference in `index.html`, `robots.txt`, and `sitemap.xml` to your actual deployed domain.
6. Redeploy, then click **Verify** in Search Console.
7. Submit `https://yourdomain.com/sitemap.xml` under **Sitemaps** in Search Console so Google can discover and index the page.

### Social preview testing

After deploying, validate the Open Graph / Twitter Card tags with:
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [Twitter/X Card Validator](https://cards-dev.twitter.com/validator)
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

---

## Free Tier Services Used

| Service | Free Tier |
|---------|-----------|
| Render (API) | 750 hrs/month |
| Render (Worker) | 750 hrs/month |
| Vercel (Frontend) | Unlimited |
| Supabase (PostgreSQL + Storage) | 500MB DB, 1GB storage |
| Neo4j Aura Free | 1 instance, 200k nodes |
| Upstash Redis | 10k requests/day |
| Google Gemini Flash | 15 RPM, 1M TPD free |

---

## License

MIT
