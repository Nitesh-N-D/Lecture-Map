import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Apply persisted/system theme before first paint to avoid a flash of
// the wrong theme on load.
;(function initTheme() {
  try {
    const raw = localStorage.getItem('lecturemap-store')
    const stored = raw ? JSON.parse(raw)?.state?.theme : null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const theme = stored || (prefersDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  } catch {
    // Non-fatal — default light theme stays in effect
  }
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
