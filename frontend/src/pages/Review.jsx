import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import ReviewCard from '../components/flashcards/ReviewCard'
import Icon from '../components/ui/Icon'
import toast from 'react-hot-toast'

export default function Review() {
  const { dueCards, setDueCards, reviewStats, setReviewStats, logActivity } = useStore()
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [sessionCount, setSessionCount] = useState(0)

  useEffect(() => {
    loadDueCards()
  }, [])

  const loadDueCards = async () => {
    setLoading(true)
    try {
      const [dueRes, statsRes] = await Promise.all([
        api.getDueCards(),
        api.getReviewStats(),
      ])
      setDueCards(dueRes.data)
      setReviewStats(statsRes.data)
      setCurrentIdx(0)
      setDone(dueRes.data.length === 0)
    } catch {
      toast.error('Failed to load review queue')
    } finally {
      setLoading(false)
    }
  }

  const handleRate = async (quality) => {
    if (!dueCards[currentIdx]) return
    const card = dueCards[currentIdx]
    try {
      await api.reviewCard(card.id, quality)
      setSessionCount((n) => n + 1)
      logActivity(1)

      if (currentIdx + 1 >= dueCards.length) {
        setDone(true)
        loadDueCards() // Refresh stats
      } else {
        setCurrentIdx((i) => i + 1)
      }
    } catch {
      toast.error('Failed to save rating')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div role="status" aria-label="Loading review queue" className="w-8 h-8 border-2 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow">Spaced repetition</p>
          <h1 className="text-4xl font-semibold text-primary mt-1">Daily review</h1>
          {reviewStats && (
            <p className="text-secondary text-sm mt-0.5">
              {reviewStats.cards_reviewed_today} reviewed today · {reviewStats.cards_due_today} in queue
            </p>
          )}
        </div>
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary">
          <Icon name="arrowLeft" size={15} /> Dashboard
        </Link>
      </div>

      {/* Stats row */}
      {reviewStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="card !rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-semibold text-brand-700">{reviewStats.cards_reviewed_today}</p>
            <p className="text-xs text-tertiary mt-0.5">Reviewed today</p>
          </div>
          <div className="card !rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-semibold text-emerald-700">{sessionCount}</p>
            <p className="text-xs text-tertiary mt-0.5">This session</p>
          </div>
          <div className="card !rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-semibold text-accent-600 inline-flex items-center justify-center gap-1">
              {reviewStats.streak_days}{reviewStats.streak_days > 0 && <Icon name="flame" size={18} label="streak" />}
            </p>
            <p className="text-xs text-tertiary mt-0.5">Day streak</p>
          </div>
          <div className="card !rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-semibold text-primary">{reviewStats.total_cards}</p>
            <p className="text-xs text-tertiary mt-0.5">Total cards</p>
          </div>
        </div>
      )}

      {/* Review area */}
      {done ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="mb-5 grid h-20 w-20 place-items-center rounded-full bg-brand-100 text-brand-700"><Icon name="party" size={38} /></span>
          <h2 className="text-4xl font-semibold text-primary mb-2">All done!</h2>
          <p className="text-secondary text-sm mb-6">
            {sessionCount > 0
              ? `You reviewed ${sessionCount} card${sessionCount !== 1 ? 's' : ''} this session.`
              : 'No cards due right now. Great job staying on top of things!'}
          </p>

          {/* Upcoming due */}
          {reviewStats?.upcoming_due && (
            <div className="w-full max-w-sm card p-5 text-left">
              <p className="text-sm font-semibold text-primary mb-3">Upcoming reviews</p>
              <div className="flex flex-col gap-2">
                {Object.entries(reviewStats.upcoming_due)
                  .filter(([, count]) => count > 0)
                  .slice(0, 5)
                  .map(([date, count]) => (
                    <div key={date} className="flex items-center justify-between text-sm">
                      <span className="text-secondary">{formatDate(date)}</span>
                      <span className="text-brand-700 font-semibold">{count} card{count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                {Object.values(reviewStats.upcoming_due).every((v) => v === 0) && (
                  <p className="text-xs text-tertiary">Nothing due in the next 7 days</p>
                )}
              </div>
            </div>
          )}

          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-700 font-semibold hover:text-brand-900"
          >
            Back to dashboard <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      ) : (
        <ReviewCard
          card={dueCards[currentIdx]}
          onRate={handleRate}
          remaining={dueCards.length - currentIdx - 1}
        />
      )}
    </div>
  )
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const today = new Date()
  const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
