import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import Icon from '../ui/Icon'
import toast from 'react-hot-toast'

const STEPS = [
  { step: 1, label: 'Preparing your upload' },
  { step: 2, label: 'Transcribing or reading text' },
  { step: 3, label: 'Extracting concepts' },
  { step: 4, label: 'Building knowledge graph' },
  { step: 5, label: 'Generating flashcards' },
]

export default function ProcessingStatus({ lectureId, onComplete, onStatusChange }) {
  const [status, setStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [pollError, setPollError] = useState('')
  const [pollingEnabled, setPollingEnabled] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const intervalRef = useRef(null)
  const elapsedRef = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const onStatusChangeRef = useRef(onStatusChange)
  const navigate = useNavigate()

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  useEffect(() => {
    if (!lectureId || !pollingEnabled) return

    const poll = async () => {
      try {
        const { data } = await api.getLectureStatus(lectureId)
        setStatus(data)
        onStatusChangeRef.current?.(data)
        setPollError('')

        if (data.status === 'COMPLETED') {
          clearInterval(intervalRef.current)
          clearInterval(elapsedRef.current)
          setPollingEnabled(false)
          toast.success('Knowledge graph ready')
          onCompleteRef.current?.()
          setTimeout(() => navigate(`/lectures/${lectureId}`), 800)
        } else if (data.status === 'FAILED') {
          clearInterval(intervalRef.current)
          clearInterval(elapsedRef.current)
          setPollingEnabled(false)
          toast.error(data.error_message || 'Processing failed')
        }
      } catch (e) {
        if (e.response?.status === 404) {
          clearInterval(intervalRef.current)
          clearInterval(elapsedRef.current)
          setStatus({
            status: 'FAILED',
            progress_step: status?.progress_step || 0,
            progress_percent: status?.progress_percent || 0,
            error_message: 'This lecture is no longer available for the current session. Please sign in again or upload it once more.',
          })
          toast.error('Lecture is no longer available')
          return
        }
        setPollError(e.response?.data?.detail || 'Could not refresh status. Retrying...')
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 3000)
    elapsedRef.current = setInterval(() => setElapsed((value) => value + 1), 1000)

    return () => {
      clearInterval(intervalRef.current)
      clearInterval(elapsedRef.current)
    }
  }, [lectureId, navigate, pollingEnabled])

  const retryFlashcards = async () => {
    setRetrying(true)
    try {
      await api.retryFlashcards(lectureId)
      setStatus((current) => ({ ...current, status: 'PENDING', error_message: null }))
      setPollingEnabled(true)
      toast.success('Missing flashcards queued')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not retry flashcards')
    } finally {
      setRetrying(false)
    }
  }

  const currentStep = status?.progress_step || 0
  const percent = status?.progress_percent || 0

  return (
    <div className="card p-6 w-full max-w-md shadow-lift">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-display text-lg font-semibold text-primary">{status?.status === 'FAILED' && status.flashcards_retryable ? 'Flashcard generation paused' : 'Processing lecture...'}</h3>
        <span className="text-sm text-tertiary font-mono">{formatElapsed(elapsed)}</span>
      </div>

      <div className="w-full h-2.5 bg-slate-200 rounded-full mb-6 overflow-hidden" role="progressbar" aria-label="Processing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div
          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-col gap-3">
        {STEPS.map(({ step, label }) => {
          const done = currentStep > step || (status?.status === 'COMPLETED' && step === 5)
          const active = ['PENDING', 'PROCESSING'].includes(status?.status) && currentStep === step
          const pending = currentStep < step
          const stepLabel = step === 5 && status?.status === 'FAILED' && status.flashcards_retryable
            ? status.error_code === 'quota_exhausted' ? 'Waiting for Gemini quota reset' : 'Flashcards partially generated'
            : label

          return (
            <div key={step} className={`flex items-center gap-3 ${pending ? 'opacity-45' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 transition-all ${
                done
                  ? 'bg-primary text-on-primary'
                  : active
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-slate-100 text-tertiary'
              }`}>
                {done ? <Icon name="check" size={14} strokeWidth={2.6} /> : active ? (
                  <span className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                ) : step}
              </div>
              <span className={`text-sm ${active ? 'text-primary font-medium' : 'text-secondary'}`}>
                {stepLabel}
                {active && <span className="text-tertiary text-xs ml-2">in progress...</span>}
                {done && <span className="text-brand-700 text-xs ml-2">done</span>}
              </span>
            </div>
          )
        })}
      </div>

      {pollError && status?.status !== 'FAILED' && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          {pollError}
        </div>
      )}

        {status?.status === 'FAILED' && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <p>{(status.error_message || 'Processing failed. Please try again.').replace(/^\[(?:GEMINI|FLASHCARD):[^\]]+\]\s*/, '')}</p>
          {status.flashcards_retryable && <p className="mt-1">Your lecture content and saved flashcards are preserved. {status.flashcards_remaining ? `${status.flashcards_remaining} concept batch(es) remain.` : ''} Retry later or configure another key.</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            {status.flashcards_retryable && <button type="button" className="font-semibold underline" onClick={retryFlashcards} disabled={retrying}>{retrying ? 'Queueing...' : 'Retry flashcard generation'}</button>}
            <Link to="/settings#gemini-key" className="font-semibold underline">Configure or update Gemini key</Link>
            <Link to={`/lectures/${lectureId}`} className="font-semibold underline">Return to lecture</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
