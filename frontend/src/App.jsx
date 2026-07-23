import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Navbar from './components/ui/Navbar'
import Sidebar from './components/ui/Sidebar'
import CommandPalette from './components/ui/CommandPalette'
import ErrorBoundary from './components/ui/ErrorBoundary'
import Landing from './pages/Landing'
import Privacy from './pages/Privacy'
import Dashboard from './pages/Dashboard'
import LectureView from './pages/LectureView'
import Review from './pages/Review'
import StudyPath from './pages/StudyPath'
import AllLecturesGraph from './pages/AllLecturesGraph'
import useStore from './store/useStore'

function AuthCallback() {
  const [params] = useSearchParams()
  const { setAuth } = useStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      // Fetch user info with the token
      const fetchUser = async () => {
        try {
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const user = await res.json()
          if (res.ok) setAuth(user, token)
        } catch {
        } finally {
          setReady(true)
        }
      }
      fetchUser()
    } else {
      setReady(true)
    }
  }, [])

  if (!ready) return null
  return <Navigate to="/dashboard" replace />
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useStore()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />
  }
  return children
}

function Layout({ children, withSidebar = false }) {
  const location = useLocation()
  // Extract lecture id from paths like /lectures/:id or /lectures/:id/study-path
  const match = location.pathname.match(/^\/lectures\/([^/]+)/)
  const lectureId = match ? match[1] : null

  return (
    <div className="min-h-screen flex flex-col surface-bg transition-colors">
      <Navbar />
      <div className="flex flex-1 min-h-0">
        {withSidebar && <Sidebar lectureId={lectureId} />}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'text-sm',
          duration: 3500,
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
                <Layout withSidebar><Dashboard /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/lectures/:id"
            element={
              <RequireAuth>
                <Layout withSidebar><LectureView /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/lectures/:id/study-path"
            element={
              <RequireAuth>
                <Layout withSidebar><StudyPath /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/review"
            element={
              <RequireAuth>
                <Layout withSidebar><Review /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/knowledge-map"
            element={
              <RequireAuth>
                <Layout withSidebar><AllLecturesGraph /></Layout>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
