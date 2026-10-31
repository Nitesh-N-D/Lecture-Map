import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api, errorMessage } from '../api/client'
import useStore from '../store/useStore'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import useTheme from '../lib/useTheme'

const THEMES = [
  ['light', 'Light', 'sun'],
  ['dark', 'Dark', 'moon'],
  ['system', 'System', 'sparkle'],
]

const KEY_STEPS = [
  <>Open <a className="font-semibold underline underline-offset-2" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio, API keys</a> and sign in with a Google account.</>,
  <>Choose <strong>Create API key</strong>. If asked, pick a project or let Google create one for you. The free tier needs no credit card.</>,
  <>Copy the key. It is a single line of letters and numbers, usually starting with <span className="font-mono">AIza</span>.</>,
  <>Paste it below and choose <strong>Save key</strong>. We check it with Google before saving.</>,
  <>Open a lecture that failed and choose <strong>Retry processing</strong>, or upload again.</>,
]

export default function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useStore()
  const [exporting, setExporting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const { pref, setPref } = useTheme()
  const [keyStatus, setKeyStatus] = useState(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [keyError, setKeyError] = useState('')

  useEffect(() => {
    if (window.location.hash === '#gemini-key') document.getElementById('gemini-key')?.scrollIntoView()
  }, [])

  useEffect(() => {
    api.getGeminiKey().then(({ data }) => setKeyStatus(data)).catch(() => setKeyStatus({ configured: false }))
  }, [])

  const saveKey = async (event) => {
    event.preventDefault()
    setKeyError('')
    setKeyBusy(true)
    try {
      const { data } = await api.saveGeminiKey(keyInput.trim())
      setKeyStatus(data)
      setKeyInput('')
      toast.success('Your Gemini key was saved.')
    } catch (err) {
      setKeyError(errorMessage(err, 'Could not save the key.'))
    } finally {
      setKeyBusy(false)
    }
  }

  const removeKey = async () => {
    setKeyBusy(true)
    try {
      const { data } = await api.deleteGeminiKey()
      setKeyStatus(data)
      toast.success('Your Gemini key was removed.')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove the key.'))
    } finally {
      setKeyBusy(false)
    }
  }

  const needsPassword = Boolean(user?.has_password)
  const canDelete = confirmText === 'DELETE' && (!needsPassword || password.length > 0) && !deleting

  const downloadData = async () => {
    setExporting(true)
    try {
      const { data } = await api.exportMyData()
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'lecturemap-my-data.json'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Your data export was downloaded.')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not export your data.'))
    } finally {
      setExporting(false)
    }
  }

  const deleteAccount = async (event) => {
    event.preventDefault()
    setError('')
    setDeleting(true)
    try {
      await api.deleteAccount(needsPassword ? password : undefined)
      logout()
      toast.success('Your account and all of its data were deleted.')
      navigate('/')
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the account.'))
      setDeleting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 text-slate-700">
      <p className="eyebrow">Account</p>
      <h1 className="mt-1 text-4xl font-semibold text-slate-950">Privacy &amp; data</h1>
      <p className="mt-2 text-sm">
        Signed in as <strong>{user?.email || 'a guest'}</strong>. Read the full{' '}
        <Link className="text-brand-700 font-semibold underline underline-offset-2" to="/privacy">privacy policy</Link>.
      </p>

      <section aria-labelledby="appearance-heading" className="mt-8 card p-6">
        <h2 id="appearance-heading" className="text-2xl font-semibold text-slate-950">Appearance</h2>
        <p className="mt-1 text-sm">Your choice is remembered on this device. System follows your device setting.</p>
        <div role="radiogroup" aria-labelledby="appearance-heading" className="mt-4 grid max-w-md grid-cols-3 gap-2">
          {THEMES.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={pref === value}
              onClick={() => setPref(value)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                pref === value ? 'border-transparent bg-primary text-on-primary' : 'surface-border text-slate-800 hover:border-brand-400'
              }`}
            >
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
      </section>

      <section id="gemini-key" aria-labelledby="gemini-heading" className="mt-6 card p-6">
        <h2 id="gemini-heading" className="text-2xl font-semibold text-slate-950">Your Gemini key</h2>
        <p className="mt-1 text-sm">
          LectureMap uses Google Gemini to find concepts and write flashcards. The shared quota can run out. Add your own free key and your
          lectures are processed with your quota instead. The key is stored encrypted, is only used for your lectures, and is never shown again.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6">
          {KEY_STEPS.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        {keyStatus?.configured && (
          <p className="mt-4 text-sm font-semibold text-brand-800" role="status">
            A key ending in <span className="font-mono">{keyStatus.last4}</span> is saved.
          </p>
        )}
        <form className="mt-4 space-y-3" onSubmit={saveKey} autoComplete="off">
          <div>
            <label htmlFor="gemini-key-input" className="block text-sm font-medium">Gemini API key</label>
            <input
              id="gemini-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="field mt-1 font-mono"
              placeholder={keyStatus?.configured ? 'Paste a new key to replace it' : 'AIza...'}
            />
          </div>
          {keyError && <p role="alert" className="text-sm text-red-700">{keyError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={keyBusy || keyInput.trim().length < 20}>{keyBusy ? 'Checking...' : 'Save key'}</Button>
            {keyStatus?.configured && (
              <Button type="button" variant="outline" onClick={removeKey} disabled={keyBusy}>Remove key</Button>
            )}
          </div>
        </form>
        <p className="mt-3 text-xs text-tertiary">
          Google's free tier has per-minute and daily limits, and Google may use free-tier prompts to improve its products. See{' '}
          <a className="underline" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">Google's terms</a>.
          Keep your key private. You can delete it here or revoke it in AI Studio at any time.
        </p>
      </section>

      <section aria-labelledby="export-heading" className="mt-6 card p-6">
        <h2 id="export-heading" className="text-2xl font-semibold text-slate-950">Download your data</h2>
        <p className="mt-1 text-sm">
          A JSON file with your account details, lectures, transcripts, concept graphs, studied concepts and flashcards.
          Uploaded source files are not included.
        </p>
        <Button className="mt-4" variant="outline" onClick={downloadData} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
      </section>

      <section aria-labelledby="delete-heading" className="mt-6 rounded-[1.25rem] border border-red-200 bg-red-50/40 p-6">
        <h2 id="delete-heading" className="text-2xl font-semibold text-red-800">Delete account</h2>
        <p className="mt-1 text-sm">
          Permanently deletes your account, every lecture, uploaded file, graph and flashcard. This cannot be undone.
        </p>
        <form className="mt-4 space-y-3" onSubmit={deleteAccount}>
          {needsPassword && (
            <div>
              <label htmlFor="delete-password" className="block text-sm font-medium">Current password</label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-1"
              />
            </div>
          )}
          <div>
            <label htmlFor="delete-confirm" className="block text-sm font-medium">
              Type <span className="font-mono">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="field mt-1"
            />
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="destructive" disabled={!canDelete}>
            {deleting ? 'Deleting…' : 'Delete my account'}
          </Button>
        </form>
      </section>
    </div>
  )
}
