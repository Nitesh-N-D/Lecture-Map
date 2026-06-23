import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev server: defaults to http://localhost:5173 and reads
// VITE_API_URL from frontend/.env (see .env.example) to know where the
// FastAPI backend lives. The build output (`npm run build` -> dist/) is
// a fully static bundle that works unmodified on Vercel, Netlify, Render
// static sites, or any static host — VITE_API_URL is baked in at build
// time via the host's environment variable settings.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // expose on LAN (0.0.0.0) for testing from other devices
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
})
