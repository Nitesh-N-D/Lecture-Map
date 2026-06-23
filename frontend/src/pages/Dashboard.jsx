import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import UploadZone from '../components/upload/UploadZone'
import ProcessingStatus from '../components/upload/ProcessingStatus'
import ProgressRing from '../components/ui/ProgressRing'
import MasteryHeatmap from '../components/ui/MasteryHeatmap'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  PENDING: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  PROCESSING: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
  COMPLETED: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400',
  FAILED: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
}

export default function Dashboard() {
  const { lectures, setLectures, activityLog } = useStore()
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [stats, setStats] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadLectures()
    loadStats()
  }, [])

  const loadLectures = async () => {
    try {
      const { data } = await api.getLectures()
      setLectures(data)
    } catch (e) {
      toast.error('Failed to load lectures')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const { data } = await api.getReviewStats()
      setStats(data)
    } catch {}
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
      setLectures(lectures.filter((l) => l.id !== id))
      toast.success('Lecture deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const completedCount = lectures.filter((l) => l.status === 'COMPLETED').length

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Your lectures</h1>
          <p className="text-secondary text-sm mt-0.5">
            {lectures.length} lecture{lectures.length !== 1 ? 's' : ''} · {stats?.total_cards || 0} flashcards
          </p>
        </div>
        <div className="flex items-center gap-2">
          {completedCount >= 2 && (
            <Link
              to="/knowledge-map"
              className="border surface-border text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:border-brand-300 transition-colors flex items-center gap-2"
            >
              🧩 Knowledge Map
            </Link>
          )}
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Add lecture
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <StatCard label="Due today" value={stats.cards_due_today} color="text-brand-600" />
          <StatCard label="Reviewed today" value={stats.cards_reviewed_today} color="text-green-600 dark:text-green-400" />
          <StatCard
            label="Day streak"
            value={stats.streak_days}
            color="text-amber-500"
            suffix={stats.streak_days > 0 ? ' 🔥' : ''}
          />
          <StatCard label="Total cards" value={stats.total_cards} color="text-primary" />
        </div>
      )}

      {/* Mastery heatmap */}
      <div className="mb-8">
        <MasteryHeatmap activityLog={activityLog} />
      </div>

      {/* Upload zone */}
      {showUpload && (
        <div className="mb-8">
          <UploadZone onSubmit={handleUploadSuccess} />
        </div>
      )}

      {/* Processing status */}
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

      {/* Lecture list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl shimmer-bg" />
          ))}
        </div>
      ) : lectures.length === 0 ? (
        <div className="text-center py-20 text-tertiary">
          <p className="text-4xl mb-4">🗺️</p>
          <p className="font-medium text-secondary mb-2">No lectures yet</p>
          <p className="text-sm">Add your first audio or YouTube lecture to get started</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 text-sm text-brand-600 font-medium hover:text-brand-700"
          >
            Upload a lecture →
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
        <div className="mt-8 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-900 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-medium text-brand-900 dark:text-brand-300 text-sm">{stats.cards_due_today} cards ready for review</p>
            <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Keep your streak going!</p>
          </div>
          <Link
            to="/review"
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Review now →
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color, suffix = '' }) {
  return (
    <div className="surface-card border surface-border rounded-xl p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}{suffix}</p>
      <p className="text-xs text-tertiary mt-0.5">{label}</p>
    </div>
  )
}

function LectureCard({ lecture, onDelete }) {
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="block surface-card border surface-border rounded-xl p-4 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-4">
        <ProgressRing percent={lecture.status === 'COMPLETED' ? 100 : 0} size={44} stroke={3} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-primary truncate">{lecture.title || 'Untitled lecture'}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-tertiary">
            {lecture.concept_count > 0 && <span>{lecture.concept_count} concepts</span>}
            {lecture.edge_count > 0 && <span>{lecture.edge_count} edges</span>}
            {lecture.flashcard_count > 0 && <span>{lecture.flashcard_count} flashcards</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[lecture.status]}`}>
            {lecture.status === 'PROCESSING' ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                Processing
              </span>
            ) : lecture.status}
          </span>
          <button
            onClick={(e) => onDelete(lecture.id, e)}
            className="opacity-0 group-hover:opacity-100 text-tertiary hover:text-red-400 transition-all text-sm"
          >
            ✕
          </button>
        </div>
      </div>
    </Link>
  )
}
