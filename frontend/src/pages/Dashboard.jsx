import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import UploadZone from '../components/upload/UploadZone'
import ProcessingStatus from '../components/upload/ProcessingStatus'
import ProgressRing from '../components/ui/ProgressRing'
import MasteryHeatmap from '../components/ui/MasteryHeatmap'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  PENDING: 'bg-slate-100 text-slate-600',
  PROCESSING: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
}

export default function Dashboard() {
  const { lectures, setLectures, activityLog } = useStore()
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [stats, setStats] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    loadLectures()
    loadStats()
  }, [])

  const loadLectures = async () => {
    try {
      setLoadError('')
      const { data } = await api.getLectures()
      setLectures(data)
    } catch (e) {
      const message = e.response?.data?.detail || 'Failed to load lectures'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const { data } = await api.getReviewStats()
      setStats(data)
    } catch {
      setStats({ cards_due_today: 0, cards_reviewed_today: 0, streak_days: 0, total_cards: 0 })
    }
  }

  const handleUploadSuccess = (lectureId) => {
    setShowUpload(false)
    setProcessingId(lectureId)
    loadLectures()
  }

  const handleDelete = async (id, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this lecture and all its flashcards?')) return
    try {
      await api.deleteLecture(id)
      setLectures(lectures.filter((lecture) => lecture.id !== id))
      toast.success('Lecture deleted')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete lecture')
    }
  }

  const completedCount = lectures.filter((lecture) => lecture.status === 'COMPLETED').length

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-start sm:items-center justify-between mb-8 flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Your lectures</h1>
          <p className="text-secondary text-sm mt-0.5">
            {lectures.length} lecture{lectures.length !== 1 ? 's' : ''} - {stats?.total_cards || 0} flashcards
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {completedCount >= 2 && (
            <Link
              to="/knowledge-map"
              className="border surface-border text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:border-brand-300 transition-colors flex-1 sm:flex-none text-center"
            >
              Knowledge Map
            </Link>
          )}
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex-1 sm:flex-none"
          >
            {showUpload ? 'Close upload' : 'Add lecture'}
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Due today" value={stats.cards_due_today} color="text-brand-600" />
          <StatCard label="Reviewed today" value={stats.cards_reviewed_today} color="text-green-600" />
          <StatCard label="Day streak" value={stats.streak_days} color="text-amber-600" />
          <StatCard label="Total cards" value={stats.total_cards} color="text-primary" />
        </div>
      )}

      <div className="mb-8">
        <MasteryHeatmap activityLog={activityLog} />
      </div>

      {showUpload && (
        <div className="mb-8">
          <UploadZone onSubmit={handleUploadSuccess} />
        </div>
      )}

      {processingId && (
        <div className="mb-8 flex justify-center">
          <ProcessingStatus
            lectureId={processingId}
            onComplete={() => {
              loadLectures()
              setProcessingId(null)
            }}
          />
        </div>
      )}

      {loadError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button onClick={loadLectures} className="font-medium text-red-800 hover:underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-xl shimmer-bg" />
          ))}
        </div>
      ) : lectures.length === 0 ? (
        <div className="text-center py-16 sm:py-20 text-tertiary border border-dashed surface-border rounded-xl bg-white">
          <p className="font-medium text-secondary mb-2">No lectures yet</p>
          <p className="text-sm px-4">Add your first audio, video, or YouTube lecture to get started.</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 text-sm text-brand-600 font-medium hover:text-brand-700"
          >
            Upload a lecture
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {lectures.map((lecture) => (
            <LectureCard key={lecture.id} lecture={lecture} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {stats?.cards_due_today > 0 && (
        <div className="mt-8 bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-medium text-brand-900 text-sm">{stats.cards_due_today} cards ready for review</p>
            <p className="text-xs text-brand-600 mt-0.5">Keep your streak going.</p>
          </div>
          <Link
            to="/review"
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Review now
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="surface-card border surface-border rounded-xl p-4 shadow-sm">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-tertiary mt-0.5">{label}</p>
    </div>
  )
}

function LectureCard({ lecture, onDelete }) {
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="block surface-card border surface-border rounded-xl p-4 hover:border-brand-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-4">
        <ProgressRing percent={lecture.status === 'COMPLETED' ? 100 : 0} size={44} stroke={3} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-primary truncate">{lecture.title || 'Untitled lecture'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-tertiary">
            {lecture.concept_count > 0 && <span>{lecture.concept_count} concepts</span>}
            {lecture.edge_count > 0 && <span>{lecture.edge_count} edges</span>}
            {lecture.flashcard_count > 0 && <span>{lecture.flashcard_count} flashcards</span>}
          </div>
          {lecture.error_message && (
            <p className="text-xs text-red-600 mt-1 truncate">{lecture.error_message}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[lecture.status] || STATUS_COLORS.PENDING}`}>
            {lecture.status === 'PROCESSING' ? 'Processing' : lecture.status}
          </span>
          <button
            onClick={(e) => onDelete(lecture.id, e)}
            className="sm:opacity-0 sm:group-hover:opacity-100 text-tertiary hover:text-red-500 transition-all text-sm"
            aria-label={`Delete ${lecture.title || 'lecture'}`}
          >
            Delete
          </button>
        </div>
      </div>
    </Link>
  )
}
