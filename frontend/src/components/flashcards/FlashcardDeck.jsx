import { useState } from 'react'
import ReviewCard from './ReviewCard'
import { api } from '../../api/client'
import useStore from '../../store/useStore'
import toast from 'react-hot-toast'

export default function FlashcardDeck({ cards, onComplete }) {
  const { logActivity } = useStore()
  const [queue, setQueue] = useState([...cards])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [done, setDone] = useState(false)
  const [reviewed, setReviewed] = useState(0)

  const current = queue[currentIdx]

  const handleRate = async (quality) => {
    try {
      await api.reviewCard(current.id, quality)
      setReviewed((r) => r + 1)
      logActivity(1)

      if (currentIdx + 1 >= queue.length) {
        setDone(true)
        onComplete?.()
      } else {
        setCurrentIdx((i) => i + 1)
      }
    } catch {
      toast.error('Failed to save review')
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span className="text-5xl">🎉</span>
        <h3 className="text-xl font-semibold text-primary">Session complete!</h3>
        <p className="text-secondary text-sm">You reviewed {reviewed} card{reviewed !== 1 ? 's' : ''}.</p>
        <button
          onClick={() => {
            setQueue([...cards])
            setCurrentIdx(0)
            setDone(false)
            setReviewed(0)
          }}
          className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          Review again ↺
        </button>
      </div>
    )
  }

  if (!current) return null

  return (
    <ReviewCard
      card={current}
      onRate={handleRate}
      remaining={queue.length - currentIdx - 1}
    />
  )
}
