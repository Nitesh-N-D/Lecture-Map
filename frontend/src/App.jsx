import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/ui/Navbar'
import Sidebar, { MobileNav } from './components/ui/Sidebar'
import CommandPalette from './components/ui/CommandPalette'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Landing from './pages/Landing'
import Privacy from './pages/Privacy'
import Dashboard from './pages/Dashboard'
import LectureView from './pages/LectureView'
import Review from './pages/Review'
import StudyPath from './pages/StudyPath'
import AllLecturesGraph from './pages/AllLecturesGraph'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import Seo from './components/ui/Seo'
import useStore from './store/useStore'
import { API_BASE } from './api/client'

export function AuthCallback() {
  const [params] = useSearchParams()
  const { setAuth } = useStore()
  const [result, setResult] = useState(null) // null while working, then 'ok' or an error code
  const started = useRef(false)

  useEffect(() => {
    // StrictMode runs effects twice in development; the fragment is single-use.
    if (started.current) return
    started.current = true
    // The API puts the session token in the URL fragment so it never reaches
    // servers or access logs. Read it once, then remove it from the address bar.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = fragment.get('token')
    window.history.replaceState(null, '', window.location.pathname)

    const oauthError = params.get('error')
    if (oauthError) return setResult(oauthError)
    if (!token) return setResult('google_oauth_failed')

    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('me_failed')
        setAuth(await res.json(), token)
        setResult('ok')
      })
      .catch(() => setResult('google_oauth_failed'))
  }, [])

  if (!result) return <div role="status" className="min-h-screen surface-bg grid place-items-center text-sm text-secondary">Completing sign-in…</div>
  return <Navigate to={result === 'ok' ? '/dashboard' : `/?auth_error=${encodeURIComponent(result)}`} replace />
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useStore()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />
  }
  return children
}

function Layout({ children, withSidebar = false, title }) {
  const location = useLocation()
  // Extract lecture id from paths like /lectures/:id or /lectures/:id/study-path
  const match = location.pathname.match(/^\/lectures\/([^/]+)/)
  const lectureId = match ? match[1] : null

  return (
    <div className="min-h-screen flex flex-col surface-bg transition-colors">
      {/* Signed-in app pages are private: keep them out of search results. */}
      {withSidebar && <Seo title={title || 'LectureMap'} noindex />}
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <div className="flex flex-1 min-h-0">
        {withSidebar && <Sidebar lectureId={lectureId} />}
        <main id="main-content" tabIndex={-1} className={`flex-1 min-w-0 outline-none ${withSidebar ? 'pb-14 lg:pb-0' : ''}`}>
          {children}
        </main>
      </div>
      {withSidebar && <MobileNav lectureId={lectureId} />}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-sm',
          duration: 3500,
          style: {
            background: 'var(--surface-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: '0.875rem',
          },
          success: { iconTheme: { primary: 'var(--viz-mid)', secondary: 'var(--surface-elevated)' } },
          error: { iconTheme: { primary: 'var(--viz-gap)', secondary: 'var(--surface-elevated)' } },
        }}
      />
      <CommandPalette />
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout><Landing /></Layout>} />
          <Route path="/privacy" element={<Layout><Privacy /></Layout>} />
          <Route path="/auth/success" element={<AuthCallback />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <Layout withSidebar title="Dashboard | LectureMap"><Dashboard /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/lectures/:id"
            element={
              <RequireAuth>
                <Layout withSidebar title="Lecture | LectureMap"><LectureView /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/lectures/:id/study-path"
            element={
              <RequireAuth>
                <Layout withSidebar title="Study path | LectureMap"><StudyPath /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/review"
            element={
              <RequireAuth>
                <Layout withSidebar title="Review flashcards | LectureMap"><Review /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/knowledge-map"
            element={
              <RequireAuth>
                <Layout withSidebar title="Knowledge map | LectureMap"><AllLecturesGraph /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Layout withSidebar title="Privacy and data | LectureMap"><Settings /></Layout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Layout><NotFound /></Layout>} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
