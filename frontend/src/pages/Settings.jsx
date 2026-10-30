import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api, errorMessage } from '../api/client'
import useStore from '../store/useStore'
import Button from '../components/ui/Button'

export default function Settings() {
  const navigate = useNavigate()
  const { user, logout } = useStore()
  const [exporting, setExporting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

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
      <h1 className="text-2xl font-semibold text-slate-950">Privacy &amp; data</h1>
      <p className="mt-2 text-sm">
        Signed in as <strong>{user?.email || 'a guest'}</strong>. Read the full{' '}
        <Link className="text-brand-700 underline" to="/privacy">privacy policy</Link>.
      </p>

      <section aria-labelledby="export-heading" className="mt-8 rounded-lg border border-slate-200 p-5">
        <h2 id="export-heading" className="text-lg font-semibold text-slate-950">Download your data</h2>
        <p className="mt-1 text-sm">
          A JSON file with your account details, lectures, transcripts, concept graphs, studied concepts and flashcards.
          Uploaded source files are not included.
        </p>
        <Button className="mt-4" variant="outline" onClick={downloadData} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download my data'}
        </Button>
      </section>

      <section aria-labelledby="delete-heading" className="mt-6 rounded-lg border border-red-200 p-5">
        <h2 id="delete-heading" className="text-lg font-semibold text-red-800">Delete account</h2>
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
