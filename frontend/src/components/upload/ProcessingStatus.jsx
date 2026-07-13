import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import toast from 'react-hot-toast'

const STEPS = [
  { step: 1, label: 'Downloading audio' },
  { step: 2, label: 'Transcribing with Whisper' },
  { step: 3, label: 'Extracting concepts' },
  { step: 4, label: 'Building knowledge graph' },
  { step: 5, label: 'Generating flashcards' },
]

export default function ProcessingStatus({ lectureId, onComplete }) {
  const [status, setStatus] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [pollError, setPollError] = useState('')
  const intervalRef = useRef(null)
  const elapsedRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!lectureId) return

    const poll = async () => {
      try {
        const { data } = await api.getLectureStatus(lectureId)
        setStatus(data)
        setPollError('')

        if (data.status === 'COMPLETED') {
          clearInterval(intervalRef.current)
          clearInterval(elapsedRef.current)
          toast.success('Knowledge graph ready')
          onComplete?.()
          setTimeout(() => navigate(`/lectures/${lectureId}`), 800)
        } else if (data.status === 'FAILED') {
          clearInterval(intervalRef.current)
          clearInterval(elapsedRef.current)
          toast.error(data.error_message || 'Processing failed')
        }
      } catch (e) {
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
  }, [lectureId, navigate, onComplete])

  const currentStep = status?.progress_step || 0
  const percent = status?.progress_percent || 0

  return (
    <div className="surface-card rounded-xl border surface-border p-6 w-full max-w-md shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-primary">Processing lecture...</h3>
        <span className="text-sm text-tertiary font-mono">{formatElapsed(elapsed)}</span>
      </div>

      <div className="w-full h-2 surface-bg rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-brand-600 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-col gap-3">
        {STEPS.map(({ step, label }) => {
          const done = currentStep > step
          const active = currentStep === step
          const pending = currentStep < step

          return (
            <div key={step} className={`flex items-center gap-3 ${pending ? 'opacity-45' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 transition-all ${
                done
                  ? 'bg-green-100 text-green-600'
                  : active
                    ? 'bg-brand-100 text-brand-600'
                    : 'surface-bg text-tertiary'
              }`}>
                {done ? 'OK' : active ? (
                  <span className="w-3 h-3 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                ) : step}
              </div>
              <span className={`text-sm ${active ? 'text-primary font-medium' : 'text-secondary'}`}>
                {label}
                {active && <span className="text-tertiary text-xs ml-2">in progress...</span>}
                {done && <span className="text-green-600 text-xs ml-2">done</span>}
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
          {status.error_message || 'Processing failed. Please try again.'}
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
