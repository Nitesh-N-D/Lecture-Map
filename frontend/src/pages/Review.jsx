import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import ReviewCard from '../components/flashcards/ReviewCard'
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
        <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">Daily review</h1>
          {reviewStats && (
            <p className="text-secondary text-sm mt-0.5">
              {reviewStats.cards_reviewed_today} reviewed today · {reviewStats.cards_due_today} in queue
            </p>
          )}
        </div>
        <Link to="/dashboard" className="text-sm text-secondary hover:text-primary">
          ← Dashboard
        </Link>
      </div>

      {/* Stats row */}
      {reviewStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="surface-card border surface-border rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-brand-600">{reviewStats.cards_reviewed_today}</p>
            <p className="text-xs text-tertiary mt-0.5">Reviewed today</p>
          </div>
          <div className="surface-card border surface-border rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{sessionCount}</p>
            <p className="text-xs text-tertiary mt-0.5">This session</p>
          </div>
          <div className="surface-card border surface-border rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-500">
              {reviewStats.streak_days}{reviewStats.streak_days > 0 ? ' 🔥' : ''}
            </p>
            <p className="text-xs text-tertiary mt-0.5">Day streak</p>
          </div>
          <div className="surface-card border surface-border rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-primary">{reviewStats.total_cards}</p>
            <p className="text-xs text-tertiary mt-0.5">Total cards</p>
          </div>
        </div>
      )}

      {/* Review area */}
      {done ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="text-6xl mb-4">🎉</span>
          <h2 className="text-2xl font-bold text-primary mb-2">All done!</h2>
          <p className="text-secondary text-sm mb-6">
            {sessionCount > 0
              ? `You reviewed ${sessionCount} card${sessionCount !== 1 ? 's' : ''} this session.`
              : 'No cards due right now. Great job staying on top of things!'}
          </p>

          {/* Upcoming due */}
          {reviewStats?.upcoming_due && (
            <div className="w-full max-w-sm surface-card border surface-border rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-primary mb-3">Upcoming reviews</p>
              <div className="flex flex-col gap-2">
                {Object.entries(reviewStats.upcoming_due)
                  .filter(([, count]) => count > 0)
                  .slice(0, 5)
                  .map(([date, count]) => (
                    <div key={date} className="flex items-center justify-between text-sm">
                      <span className="text-secondary">{formatDate(date)}</span>
                      <span className="text-brand-600 font-medium">{count} card{count !== 1 ? 's' : ''}</span>
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
            className="mt-6 text-sm text-brand-600 font-medium hover:text-brand-700"
          >
            Back to dashboard →
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
