import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE } from '../../api/client'
import useStore from '../../store/useStore'
import Button from './Button'
import toast from 'react-hot-toast'

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

  const handleGoogleLogin = () => {
    window.location.assign(`${API_BASE}/auth/google`)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 cmdk-overlay"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm surface-card border surface-border rounded-xl shadow-2xl p-6 animate-scale-in"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 id="auth-dialog-title" className="text-lg font-semibold text-primary">
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
            <p role="alert" className="text-xs text-red-700 animate-fade-in">{error}</p>
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

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t surface-border" /></div>
          <div className="relative flex justify-center"><span className="surface-card px-3 text-xs text-tertiary">or</span></div>
        </div>

        <Button type="button" variant="outline" onClick={handleGoogleLogin} disabled={loading} className="w-full gap-2">
          <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-slate-300 text-[11px] font-bold text-brand-600">G</span>
          Continue with Google
        </Button>

        <p className="text-center text-xs text-tertiary mt-4">
          {mode === 'login' ? (
            <>Do not have an account?{' '}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('signup'); setError('') }} className="text-brand-600 font-medium h-auto px-0">
                Sign up
              </Button>
            </>
          ) : (
            <>Already have an account?{' '}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('login'); setError('') }} className="text-brand-600 font-medium h-auto px-0">
                Sign in
              </Button>
            </>
          )}
        </p>

        <Button
          variant="ghost"
          onClick={handleGuestLogin}
          disabled={loading}
          className="w-full mt-3 text-xs text-tertiary"
        >
          Continue as guest without signup
        </Button>
      </div>
    </div>
  )
}
