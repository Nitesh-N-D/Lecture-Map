import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { api } from '../../api/client'
import AuthModal from './AuthModal'
import toast from 'react-hot-toast'

export default function Navbar() {
  const { user, isAuthenticated, logout, setAuth, setCommandPaletteOpen, reviewStats } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [authModal, setAuthModal] = useState(null)

  const handleGuestLogin = async () => {
    try {
      const { data } = await api.guestLogin()
      setAuth(data.user, data.access_token)
      navigate('/dashboard')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start guest session')
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const isActive = (path) => location.pathname === path
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

  return (
    <nav className="min-h-14 surface-card border-b surface-border flex items-center px-3 sm:px-4 gap-3 sticky top-0 z-40">
      <Link to="/" className="flex items-center gap-2 font-semibold text-primary shrink-0">
        <span className="w-8 h-8 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold">LM</span>
        <span className="hidden sm:block">LectureMap</span>
      </Link>

      {isAuthenticated && (
        <div className="flex items-center gap-1 overflow-x-auto">
          <NavLink to="/dashboard" active={isActive('/dashboard')}>Dashboard</NavLink>
          <NavLink to="/review" active={isActive('/review')}>
            Review
            {reviewStats?.cards_due_today > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold bg-brand-600 text-white rounded-full">
                {reviewStats.cards_due_today}
              </span>
            )}
          </NavLink>
        </div>
      )}

      {isAuthenticated && (
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 text-sm text-tertiary surface-border border rounded-lg px-3 py-1.5 hover:border-slate-300 transition-colors ml-2"
        >
          <span>Search</span>
          <kbd className="ml-2 text-[10px] font-mono surface-bg border surface-border rounded px-1.5 py-0.5">
            {isMac ? 'Cmd K' : 'Ctrl K'}
          </kbd>
        </button>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {isAuthenticated ? (
          <>
            <span className="hidden sm:block text-sm text-secondary truncate max-w-[140px]">
              {user?.name || 'Guest'}
              {user?.is_guest && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">guest</span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleGuestLogin}
              className="hidden sm:inline text-sm text-secondary hover:text-primary"
            >
              Try as guest
            </button>
            <button
              onClick={() => setAuthModal('login')}
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setAuthModal('signup')}
              className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700 transition-colors"
            >
              Sign up
            </button>
          </>
        )}
      </div>

      <AuthModal
        open={!!authModal}
        initialMode={authModal || 'login'}
        onClose={() => setAuthModal(null)}
      />
    </nav>
  )
}

function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      className={`flex items-center text-sm px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
        active
          ? 'bg-brand-50 text-brand-600 font-medium'
          : 'text-secondary hover:bg-slate-50'
      }`}
    >
      {children}
    </Link>
  )
}
