import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import useStore from '../../store/useStore'
import toast from 'react-hot-toast'

const DIFFICULTY_BADGE = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-blue-100 text-blue-700',
  advanced: 'bg-pink-100 text-pink-700',
}

export default function NodePanel({ node, onClose, lectureId }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [flashcard, setFlashcard] = useState(null)
  const { markNodeVisited, visitedNodes } = useStore()
  const navigate = useNavigate()

  const isVisited = node ? visitedNodes.has(node.concept_id) : false

  useEffect(() => {
    if (!node) return
    setDetail(null)
    setFlashcard(null)

    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.getConcept(node.concept_id)
        setDetail(data)
      } catch (e) {
        // Non-critical
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [node?.concept_id])

  // Close on Escape for keyboard-friendly navigation
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleMarkStudied = async () => {
    if (!node) return
    try {
      await api.markVisited(node.concept_id)
      markNodeVisited(node.concept_id)
      toast.success(`"${node.name}" marked as studied`)
    } catch {
      toast.error('Failed to mark as studied')
    }
  }

  const handleLoadFlashcard = async () => {
    try {
      const { data } = await api.getFlashcards(lectureId)
      const card = data.find((c) => c.concept_id === node.concept_id)
      setFlashcard(card || null)
      if (!card) toast('No flashcard found for this concept', { icon: 'ℹ️' })
    } catch {
      toast.error('Failed to load flashcard')
    }
  }

  const handleAddToStudyPath = () => {
    if (!node) return
    navigate(`/lectures/${lectureId}/study-path?target=${encodeURIComponent(node.concept_id)}`)
  }

  if (!node) return null

  return (
    <div
      className="w-80 surface-card border-l surface-border flex flex-col shadow-lg animate-slide-in overflow-y-auto transition-colors"
      style={{ maxHeight: '100%' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b surface-border">
        <div className="flex-1 pr-2">
          <h2 className="font-semibold text-primary text-base leading-snug">{node.name}</h2>
          <span className={`mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_BADGE[node.difficulty] || DIFFICULTY_BADGE.intermediate}`}>
            {node.difficulty}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close panel" className="text-tertiary hover:text-secondary text-xl leading-none">×</button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4 flex-1">
        {/* Definition */}
        <div>
          <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-1">Definition</p>
          <p className="text-sm text-secondary leading-relaxed">{node.definition}</p>
        </div>

        {/* Timestamp */}
        {node.timestamp_seconds > 0 && (
          <div>
            <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-1">Introduced at</p>
            <span className="text-sm text-brand-600 font-mono">
              {formatTime(node.timestamp_seconds)}
            </span>
          </div>
        )}

        {/* Prerequisites */}
        {loading && <p className="text-xs text-tertiary">Loading connections…</p>}
        {detail && (
          <>
            {detail.prerequisites?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">
                  Prerequisites ({detail.prerequisites.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {detail.prerequisites.map((pre) => (
                    <ConceptChip
                      key={pre.concept_id}
                      node={pre}
                      visited={visitedNodes.has(pre.concept_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {detail.dependents?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">
                  Unlocks ({detail.dependents.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {detail.dependents.map((dep) => (
                    <ConceptChip
                      key={dep.concept_id}
                      node={dep}
                      visited={visitedNodes.has(dep.concept_id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Inline flashcard */}
        {flashcard && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-brand-700 mb-1">Flashcard</p>
            <p className="text-sm font-medium text-primary mb-2">Q: {flashcard.question}</p>
            <details>
              <summary className="text-xs text-brand-600 cursor-pointer">Show answer</summary>
              <p className="text-sm text-secondary mt-1.5">A: {flashcard.answer}</p>
            </details>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t surface-border flex flex-col gap-2">
        <button
          onClick={handleMarkStudied}
          disabled={isVisited}
          className={`w-full text-sm py-2 rounded-lg font-medium transition-colors ${
            isVisited
              ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          {isVisited ? '✓ Studied' : 'Mark as studied'}
        </button>

        <div className="flex gap-2">
          {!flashcard && (
            <button
              onClick={handleLoadFlashcard}
              className="flex-1 text-sm py-2 rounded-lg font-medium border surface-border text-secondary hover:surface-card-hover transition-colors"
            >
              View flashcard
            </button>
          )}
          <button
            onClick={handleAddToStudyPath}
            className="flex-1 text-sm py-2 rounded-lg font-medium border surface-border text-secondary hover:surface-card-hover transition-colors"
          >
            🗺️ Study path
          </button>
        </div>
      </div>
    </div>
  )
}

function ConceptChip({ node, visited }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs ${
      visited
        ? 'bg-green-50 text-green-700'
        : 'surface-bg text-secondary'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${visited ? 'bg-green-500' : 'bg-[var(--surface-border-strong)]'}`} />
      <span className="truncate">{node.name}</span>
      {visited && <span className="ml-auto shrink-0">✓</span>}
    </div>
  )
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
