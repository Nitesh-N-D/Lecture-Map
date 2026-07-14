import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import useStore from '../../store/useStore'
import Button from './Button'
import toast from 'react-hot-toast'

const GOOGLE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/auth/google`

export default function AuthModal({ open, onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const emailRef = useRef(null)
  const { setAuth } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError('')
      setPassword('')
      setTimeout(() => emailRef.current?.focus(), 10)
    }
  }, [open, initialMode])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const { data } =
        mode === 'login'
          ? await api.login(email, password)
          : await api.signup(email, password, name)

      setAuth(data.user, data.access_token)
      toast.success(mode === 'login' ? 'Welcome back' : 'Account created')
      onClose?.()
      navigate('/dashboard')
    } catch (err) {
      const detail = err.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGuestLogin = async () => {
    setLoading(true)
    try {
      const { data } = await api.guestLogin()
      setAuth(data.user, data.access_token)
      onClose?.()
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to start guest session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 cmdk-overlay"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm surface-card border surface-border rounded-xl shadow-2xl p-6 animate-scale-in"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-primary">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="px-2">
            x
          </Button>
        </div>
        <p className="text-sm text-tertiary mb-5">
          {mode === 'login'
            ? 'Sign in to access your lectures and review queue.'
            : 'Free, no credit card. Use an email and password.'}
        </p>

        <a
          href={GOOGLE_URL}
          className="w-full flex items-center justify-center gap-2 border surface-border rounded-lg py-2.5 text-sm font-medium text-primary hover:bg-slate-50 transition-colors mb-3"
        >
          <GoogleIcon />
          Continue with Google
        </a>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[var(--surface-border)]" />
          <span className="text-xs text-tertiary">or</span>
          <div className="flex-1 h-px bg-[var(--surface-border)]" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <label className="text-xs font-medium text-secondary">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full surface-bg border surface-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 text-primary"
              />
            </label>
          )}
          <label className="text-xs font-medium text-secondary">
            Email
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full surface-bg border surface-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 text-primary"
            />
          </label>
          <label className="text-xs font-medium text-secondary">
            Password{mode === 'signup' ? ' (minimum 8 characters)' : ''}
            <input
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full surface-bg border surface-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 text-primary"
            />
          </label>

          {error && (
            <p className="text-xs text-red-500 animate-fade-in">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-1 gap-2"
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-xs text-tertiary mt-4">
          {mode === 'login' ? (
            <>Do not have an account?{' '}
              <button onClick={() => { setMode('signup'); setError('') }} className="text-brand-600 font-medium hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => { setMode('login'); setError('') }} className="text-brand-600 font-medium hover:underline">
                Sign in
              </button>
            </>
          )}
        </p>

        <Button
          variant="ghost"
          onClick={handleGuestLogin}
          disabled={loading}
          className="w-full mt-4 text-xs text-tertiary"
        >
          Continue as guest without signup
        </Button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.65 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  )
}
