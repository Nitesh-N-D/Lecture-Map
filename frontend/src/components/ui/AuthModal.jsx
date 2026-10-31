import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, API_BASE } from '../../api/client'
import useStore from '../../store/useStore'
import Button from './Button'
import Icon, { LogoMark } from './Icon'
import Modal from './Modal'
import toast from 'react-hot-toast'

export default function AuthModal({ open, onClose, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef(null)
  const { setAuth } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setMode(initialMode)
      setError('')
      setPassword('')
      setShowPassword(false)
    }
  }, [open, initialMode])

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
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="auth-dialog-title"
      initialFocusRef={emailRef}
      className="max-w-md md:max-w-[56rem] md:grid md:grid-cols-[0.85fr_1fr] md:overflow-hidden"
    >
      <aside className="ink-panel hidden md:flex flex-col justify-between p-8 !border-0">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="font-display text-xl font-semibold text-sage-50">LectureMap</span>
        </div>
        <div>
          <svg viewBox="0 0 220 150" className="w-full max-w-[15rem]" aria-hidden="true">
            <g stroke="#78a98a" strokeWidth="1.5" fill="none" opacity="0.8">
              <path d="M40 110 85 60M85 60l55 20M140 80l50-45M140 80l25 55M85 60l30-40" />
            </g>
            <circle cx="40" cy="110" r="9" fill="#b9d6bf" />
            <circle cx="85" cy="60" r="12" fill="#78a98a" />
            <circle cx="140" cy="80" r="10" fill="#e5f0e5" />
            <circle cx="190" cy="35" r="7" fill="none" stroke="#b9d6bf" strokeWidth="2" strokeDasharray="3 3" />
            <circle cx="165" cy="135" r="8" fill="#347d59" />
            <circle cx="115" cy="20" r="6" fill="#b9d6bf" />
          </svg>
          <p className="mt-6 font-display text-2xl font-semibold leading-snug text-sage-50">
            Turn lectures into a connected map of knowledge.
          </p>
          <p className="mt-2 text-sm leading-6 text-sage-300">
            Your account keeps your graphs, study paths and review schedule together.
          </p>
        </div>
      </aside>

      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <h2 id="auth-dialog-title" className="text-3xl font-semibold text-primary">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="px-2 -mr-2 -mt-1">
            <Icon name="x" size={16} />
          </Button>
        </div>
        <p className="text-sm text-secondary mt-1 mb-5">
          {mode === 'login'
            ? 'Sign in to access your lectures and review queue.'
            : 'Free, no credit card. Use an email and password.'}
        </p>

        <Button type="button" variant="outline" onClick={handleGoogleLogin} disabled={loading} className="w-full gap-2">
          <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full border border-slate-300 text-[11px] font-bold text-brand-700">G</span>
          Continue with Google
        </Button>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t surface-border" /></div>
          <div className="relative flex justify-center"><span className="surface-card px-3 text-xs text-tertiary">or use email</span></div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <label className="text-xs font-semibold text-secondary">
              Name
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field mt-1.5"
              />
            </label>
          )}
          <label className="text-xs font-semibold text-secondary">
            Email
            <input
              ref={emailRef}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field mt-1.5"
            />
          </label>
          <div>
            <label htmlFor="auth-password" className="text-xs font-semibold text-secondary">
              Password{mode === 'signup' ? ' (minimum 8 characters)' : ''}
            </label>
            <div className="relative mt-1.5">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide text' : 'Show text'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-600 hover:text-slate-900"
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 animate-fade-in">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full mt-1 gap-2">
            {loading && <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-xs text-tertiary mt-4">
          {mode === 'login' ? (
            <>Do not have an account?{' '}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('signup'); setError('') }} className="text-brand-700 font-semibold h-auto px-0">
                Sign up
              </Button>
            </>
          ) : (
            <>Already have an account?{' '}
              <Button type="button" variant="ghost" size="sm" onClick={() => { setMode('login'); setError('') }} className="text-brand-700 font-semibold h-auto px-0">
                Sign in
              </Button>
            </>
          )}
        </p>

        <Button variant="ghost" onClick={handleGuestLogin} disabled={loading} className="w-full mt-2 text-xs text-secondary">
          Continue as guest without signup
        </Button>
      </div>
    </Modal>
  )
}
