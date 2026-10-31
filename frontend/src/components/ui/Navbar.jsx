import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { api } from '../../api/client'
import AuthModal from './AuthModal'
import Button from './Button'
import Icon, { LogoMark } from './Icon'
import ThemeToggle from './ThemeToggle'
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

  const handleLogout = async () => {
    try {
      await api.logout()
    } catch (error) {
      if (error.response?.status !== 401) {
        toast.error('Signed out locally. The server could not end this session.')
      }
    } finally {
      logout()
      navigate('/')
    }
  }

  const isActive = (path) => location.pathname === path
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

  return (
    <nav className="h-14 bg-[var(--surface-bg)] border-b surface-border flex items-center px-3 sm:px-5 gap-3 sticky top-0 z-40">
      <Link to="/" aria-label="LectureMap home" className="flex items-center gap-2.5 text-primary shrink-0">
        <LogoMark size={30} />
        <span className="hidden sm:block font-display text-lg font-semibold tracking-tight">LectureMap</span>
      </Link>

      {isAuthenticated && (
        <div className="hidden lg:flex items-center gap-1 ml-1">
          <NavLink to="/dashboard" active={isActive('/dashboard')}>Dashboard</NavLink>
          <NavLink to="/review" active={isActive('/review')}>
            Review
            {reviewStats?.cards_due_today > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold bg-accent-500 text-on-accent rounded-full">
                {reviewStats.cards_due_today}
              </span>
            )}
          </NavLink>
        </div>
      )}

      {isAuthenticated && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex gap-2 ml-2 text-tertiary font-medium"
        >
          <Icon name="search" size={15} />
          <span>Search</span>
          <kbd className="ml-3 text-[10px] font-mono bg-slate-100 border surface-border rounded-md px-1.5 py-0.5">
            {isMac ? 'Cmd K' : 'Ctrl K'}
          </kbd>
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        {isAuthenticated ? (
          <>
            <span className="hidden sm:flex items-center gap-2 text-sm text-secondary truncate max-w-[180px]">
              <span className="grid place-items-center w-7 h-7 rounded-full bg-brand-100 text-brand-800 text-xs font-bold uppercase" aria-hidden="true">
                {(user?.name || 'G').charAt(0)}
              </span>
              <span className="truncate">{user?.name || 'Guest'}</span>
              {user?.is_guest && (
                <span className="chip border-accent-200 bg-accent-50 text-accent-700">guest</span>
              )}
            </span>
            <Link
              to="/settings"
              className="hidden sm:inline-flex items-center h-9 px-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-900/5"
            >
              Privacy
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={handleGuestLogin} className="hidden sm:inline-flex">
              Try as guest
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAuthModal('login')}>
              Sign in
            </Button>
            <Button size="sm" onClick={() => setAuthModal('signup')}>
              Sign up
            </Button>
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
      aria-current={active ? 'page' : undefined}
      className={`flex items-center text-sm px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap ${
        active
          ? 'bg-brand-100 text-brand-800 font-semibold'
          : 'text-secondary font-medium hover:bg-slate-900/5'
      }`}
    >
      {children}
    </Link>
  )
}
