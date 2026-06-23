import { useState, useEffect, useRef } from 'react'
import { QUALITY_LABELS, getEasinessColor, getEasinessLabel } from '../../utils/srs'

// Maps keyboard digit keys to SM-2 quality ratings, matching the four
// buttons shown on screen (Again / Hard / Good / Easy).
const KEY_TO_QUALITY = { '0': 0, '1': 2, '2': 2, '3': 3, '4': 3, '5': 5 }

export default function ReviewCard({ card, onRate, remaining }) {
  const [flipped, setFlipped] = useState(false)
  const [rating, setRating] = useState(null)
  const cardRef = useRef(null)

  // Reset flip state whenever a new card is shown
  useEffect(() => {
    setFlipped(false)
    setRating(null)
  }, [card?.id])

  const handleRate = (quality) => {
    if (rating !== null) return
    setRating(quality)
    setTimeout(() => {
      setFlipped(false)
      setRating(null)
      onRate(quality)
    }, 400)
  }

  // Keyboard-first review: Space/Enter flips the card, number keys rate it.
  // This is the kind of detail that makes a daily-habit tool feel fast
  // rather than click-driven — a power user can review an entire deck
  // without touching the mouse.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (!flipped && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault()
        setFlipped(true)
        return
      }
      if (flipped && e.key in KEY_TO_QUALITY) {
        e.preventDefault()
        handleRate(KEY_TO_QUALITY[e.key])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flipped, rating])

  if (!card) return null

  const efColor = getEasinessColor(card.easiness_factor)
  const efLabel = getEasinessLabel(card.easiness_factor)

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl px-4">
      {/* Progress */}
      {remaining !== undefined && (
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-1.5 surface-border bg-[var(--surface-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: remaining > 0 ? `${Math.max(5, 100 - remaining * 5)}%` : '100%' }}
            />
          </div>
          <span className="text-xs text-tertiary shrink-0">{remaining} left</span>
        </div>
      )}

      {/* Confidence indicator — visualizes this card's current SM-2 easiness
          factor so the learner sees at a glance whether they tend to find
          this concept easy or consistently hard, before even flipping it. */}
      {card.repetitions > 0 && (
        <div className="w-full flex items-center justify-between -mb-2">
          <span className="text-xs text-tertiary">
            Reviewed {card.total_reviews}× · interval {card.interval_days}d
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color: efColor, background: efColor + '1a' }}
          >
            {efLabel}
          </span>
        </div>
      )}

      {/* Flashcard with 3D flip */}
      <div
        ref={cardRef}
        className="w-full"
        style={{ perspective: '1000px', minHeight: '220px' }}
        onClick={() => !flipped && setFlipped(true)}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s ease',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            position: 'relative',
            minHeight: '220px',
          }}
        >
          {/* Front */}
          <div
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
            className="absolute inset-0 surface-card border surface-border rounded-2xl p-8 flex flex-col items-center justify-center shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          >
            <p className="text-xs text-brand-500 dark:text-brand-400 font-semibold uppercase tracking-wider mb-3">
              {card.concept_name}
            </p>
            <p className="text-lg font-medium text-primary text-center leading-snug">
              {card.question}
            </p>
            <p className="mt-6 text-xs text-tertiary">
              Tap or press <kbd className="border surface-border rounded px-1.5 py-0.5 font-mono">space</kbd> to reveal
            </p>
          </div>

          {/* Back */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
            className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-2xl p-8 flex flex-col justify-between shadow-sm"
          >
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Answer</p>
              <p className="text-base text-white leading-relaxed">{card.answer}</p>
            </div>
            <p className="text-xs text-slate-500 mt-4 border-t border-slate-700 pt-3">
              {card.concept_name}
            </p>
          </div>
        </div>
      </div>

      {/* Rating buttons (only after flip) */}
      {flipped && (
        <div className="flex gap-3 w-full animate-fade-in">
          {[0, 2, 3, 5].map((q) => {
            const { label, color, description } = QUALITY_LABELS[q]
            const active = rating === q
            return (
              <button
                key={q}
                onClick={() => handleRate(q)}
                disabled={rating !== null}
                className={`relative flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                  active ? 'scale-95 opacity-70' : 'hover:scale-105'
                }`}
                style={{
                  borderColor: color,
                  background: active ? color + '22' : 'transparent',
                }}
              >
                <span className="text-sm font-semibold" style={{ color }}>{label}</span>
                <span className="text-xs text-tertiary">{description}</span>
                <kbd className="absolute -top-2 -right-2 text-[9px] font-mono surface-card border surface-border rounded px-1 text-tertiary">
                  {q}
                </kbd>
              </button>
            )
          })}
        </div>
      )}

      {!flipped && (
        <button
          onClick={() => setFlipped(true)}
          className="text-sm text-secondary hover:text-primary"
        >
          Show answer ↓
        </button>
      )}
    </div>
  )
}
