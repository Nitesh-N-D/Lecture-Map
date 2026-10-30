import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against a real FastAPI process on a throwaway SQLite
// database with every external service blanked (no Gemini, Supabase, Neo4j,
// Redis, real Google). They never touch backend/.env credentials.
const API = 'http://127.0.0.1:8010'
const WEB = 'http://127.0.0.1:5174'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: WEB, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: '"venv/Scripts/python.exe" -m uvicorn app.main:app --port 8010 --host 127.0.0.1',
      cwd: '../backend',
      url: `${API}/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        ENVIRONMENT: 'test',
        DATABASE_URL: 'sqlite+aiosqlite:///./e2e-scratch.db',
        UPLOAD_DIR: './e2e-uploads',
        RATE_LIMIT_ENABLED: 'false',
        USE_CELERY: 'false',
        JWT_SECRET: 'e2e-only-secret-not-for-real-use-0123456789',
        FRONTEND_URL: WEB,
        BACKEND_URL: API,
        GEMINI_API_KEY: '',
        SUPABASE_URL: '',
        SUPABASE_KEY: '',
        NEO4J_URI: '',
        NEO4J_PASSWORD: '',
        REDIS_URL: '',
        GOOGLE_CLIENT_ID: 'e2e-client-id',
        GOOGLE_CLIENT_SECRET: 'e2e-client-secret',
      },
    },
    {
      command: 'npx vite --port 5174 --host 127.0.0.1 --strictPort',
      url: WEB,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: API },
    },
  ],
})
