import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import UploadZone from '../components/upload/UploadZone'
import ProcessingStatus from '../components/upload/ProcessingStatus'
import ProgressRing from '../components/ui/ProgressRing'
import MasteryHeatmap from '../components/ui/MasteryHeatmap'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  PENDING: 'bg-slate-100 text-slate-700 border-slate-200',
  PROCESSING: 'bg-amber-50 text-amber-800 border-amber-200',
  COMPLETED: 'bg-brand-50 text-brand-800 border-brand-200',
  FAILED: 'bg-red-50 text-red-800 border-red-200',
}

export default function Dashboard() {
  const { lectures, setLectures } = useStore()
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [stats, setStats] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [progress, setProgress] = useState(null)
  const [progressError, setProgressError] = useState(false)
  const [history, setHistory] = useState({})

  useEffect(() => {
    loadLectures()
    loadStats()
    loadProgress()
  }, [])

  useEffect(() => {
    if (processingId) return
    const activeLecture = lectures.find((lecture) =>
      lecture.status === 'PENDING' || lecture.status === 'PROCESSING'
    )
    if (activeLecture) {
      setProcessingId(activeLecture.id)
    }
  }, [lectures, processingId])

  useEffect(() => {
    if (!processingId) return
    document.getElementById('lecture-processing-status')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [processingId])

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
      const [{ data }, hist] = await Promise.all([api.getReviewStats(), api.getReviewHistory()])
      setStats(data)
      setHistory(hist.data?.days || {})
    } catch {
      // Show nothing rather than invented zeros; the progress panel reports errors.
      setStats(null)
    }
  }

  const loadProgress = async () => {
    try {
      setProgressError(false)
      const { data } = await api.getProgressSummary()
      setProgress(data)
    } catch {
      setProgressError(true)
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
      loadProgress()
      loadStats()
      toast.success('Lecture deleted')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete lecture')
    }
  }

  const completedCount = lectures.filter((lecture) => lecture.status === 'COMPLETED').length

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in">
      <div className="flex items-start sm:items-center justify-between mb-8 flex-col sm:flex-row gap-4">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="text-4xl font-semibold text-primary mt-1">Your lectures</h1>
          <p className="text-secondary text-sm mt-1.5">
            {lectures.length} lecture{lectures.length !== 1 ? 's' : ''} - {stats?.total_cards || 0} flashcards
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {completedCount >= 2 && (
            <Link
              to="/knowledge-map"
              className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-[var(--surface-card)] shadow-paper text-slate-800 px-4 h-10 rounded-xl text-sm font-semibold hover:border-brand-400 transition-colors flex-1 sm:flex-none"
            >
              Knowledge Map
            </Link>
          )}
          <Button
            onClick={() => setShowUpload(!showUpload)}
            className="flex-1 sm:flex-none"
          >
            {!showUpload && <Icon name="upload" size={16} />}
            {showUpload ? 'Close upload' : 'Add lecture'}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Due today" value={stats.cards_due_today} icon="cards" tone="bg-brand-100 text-brand-700" />
          <StatCard label="Reviewed today" value={stats.cards_reviewed_today} icon="check" tone="bg-emerald-100 text-emerald-800" />
          <StatCard label="Day streak" value={stats.streak_days} icon="flame" tone="bg-accent-100 text-accent-700" />
          <StatCard label="Total cards" value={stats.total_cards} icon="sparkle" tone="bg-brand-200 text-brand-900" />
        </div>
      )}

      <LearningProgress progress={progress} error={progressError} onRetry={loadProgress} lectures={lectures} />

      <div className="mb-8">
        <MasteryHeatmap activityLog={history} />
      </div>

      {showUpload && (
        <div className="mb-8">
          <UploadZone onSubmit={handleUploadSuccess} />
        </div>
      )}

      {processingId && (
        <div id="lecture-processing-status" className="mb-8 flex justify-center">
          <ProcessingStatus
            lectureId={processingId}
            onStatusChange={(status) => {
              if (status.status === 'PROCESSING' || status.status === 'FAILED') {
                loadLectures()
              }
            }}
            onComplete={() => {
              loadLectures()
              loadProgress()
              loadStats()
              setProcessingId(null)
            }}
          />
        </div>
      )}

      {loadError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button variant="ghost" size="sm" onClick={loadLectures} className="text-red-800">
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 rounded-2xl shimmer-bg" />
          ))}
        </div>
      ) : lectures.length === 0 ? (
        <div className="text-center py-16 sm:py-20 text-tertiary border-2 border-dashed border-slate-300 rounded-3xl bg-[var(--surface-card)]">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-700"><Icon name="upload" size={26} /></span>
          <p className="font-display text-2xl font-semibold text-primary mb-2">No lectures yet</p>
          <p className="text-sm px-4">Add your first audio, video, or text-based PDF to get started.</p>
          <Button
            variant="ghost"
            onClick={() => setShowUpload(true)}
            className="mt-4 text-brand-700"
          >
            Upload a lecture
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {lectures.map((lecture) => (
            <LectureCard
              key={lecture.id}
              lecture={lecture}
              onDelete={handleDelete}
              progress={progress?.lectures?.find((item) => item.lecture_id === lecture.id)}
            />
          ))}
        </div>
      )}

      {stats?.cards_due_today > 0 && (
        <div className="mt-8 ink-panel rounded-3xl p-6 flex items-center justify-between flex-wrap gap-4 shadow-lift">
          <div>
            <p className="font-display text-2xl font-semibold text-sage-50">{stats.cards_due_today} cards ready for review</p>
            <p className="text-sm text-sage-200 mt-1">Keep your streak going.</p>
          </div>
          <Link
            to="/review"
            className="inline-flex items-center gap-2 bg-accent-500 text-on-accent px-5 h-11 rounded-xl text-sm font-bold hover:bg-accent-400 transition-colors"
          >
            Review now <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, tone }) {
  return (
    <div className="card p-4 flex items-center gap-3.5">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon name={icon} size={20} /></span>
      <div>
        <p className="font-display text-3xl font-semibold leading-none text-primary">{value}</p>
        <p className="text-xs text-tertiary mt-1.5">{label}</p>
      </div>
    </div>
  )
}

function LearningProgress({ progress, error, onRetry, lectures }) {
  if (error) {
    return (
      <div role="alert" className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center justify-between gap-3">
        <span>Could not load your learning progress.</span>
        <Button variant="ghost" size="sm" onClick={onRetry} className="text-red-800">Retry</Button>
      </div>
    )
  }
  if (!progress) {
    return <div className="mb-6 h-36 rounded-2xl shimmer-bg" role="status" aria-label="Loading learning progress" />
  }
  if (progress.total_concepts === 0) return null
  const current = progress.lectures.find((item) => item.lecture_id === progress.current_lecture_id)
  const currentTitle = current?.title || lectures.find((l) => l.id === progress.current_lecture_id)?.title
  return (
    <section aria-labelledby="progress-heading" className="card p-5 sm:p-6 mb-6">
      <div className="flex flex-wrap items-center gap-5">
        <ProgressRing percent={progress.percent} size={72} stroke={5} />
        <div className="flex-1 min-w-[12rem]">
          <h2 id="progress-heading" className="font-display text-2xl font-semibold text-primary">Learning progress</h2>
          <p className="text-sm text-secondary mt-1">
            {progress.completed_concepts} of {progress.total_concepts} concepts studied or mastered ({progress.percent}%)
          </p>
        </div>
        {current && (
          <Link
            to={`/lectures/${current.lecture_id}`}
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-4 min-h-10 py-2 rounded-xl text-sm font-semibold shadow-paper hover:bg-primary-hover transition-colors max-sm:w-full max-sm:justify-center"
          >
            <span className="truncate max-w-[16rem]">Continue {currentTitle || 'learning'}</span> <Icon name="arrowRight" size={16} />
          </Link>
        )}
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Metric label="Total concepts" value={progress.total_concepts} />
        <Metric label="Completed" value={progress.completed_concepts} />
        <Metric label="Mastered" value={progress.mastered_concepts} />
        <Metric label="Pending" value={progress.pending_concepts} />
      </dl>
    </section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-[var(--surface-card)] border surface-border px-3 py-2.5">
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="font-display text-2xl font-semibold text-primary leading-tight">{value}</dd>
    </div>
  )
}

function LectureCard({ lecture, onDelete, progress }) {
  return (
    <Link
      to={`/lectures/${lecture.id}`}
      className="block card card-interactive p-4 sm:p-5 group"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ProgressRing percent={progress?.percent || 0} size={44} stroke={3} />
        <div className="flex-1 min-w-[9rem]">
          <p className="font-display text-lg font-semibold text-primary truncate">{lecture.title || 'Untitled lecture'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-tertiary">
            {lecture.concept_count > 0 && <span>{lecture.concept_count} concepts</span>}
            {lecture.edge_count > 0 && <span>{lecture.edge_count} edges</span>}
            {lecture.flashcard_count > 0 && <span>{lecture.flashcard_count} flashcards</span>}
            {progress?.concepts > 0 && <span>{progress.completed} / {progress.concepts} learned</span>}
          </div>
          {lecture.error_message && (
            <p className="text-xs text-red-700 mt-1 truncate">{lecture.error_message}</p>
          )}
        </div>
        <div className="flex items-center gap-3 max-sm:basis-full max-sm:justify-between">
          <span className={`chip ${STATUS_COLORS[lecture.status] || STATUS_COLORS.PENDING}`}>
            {lecture.status === 'PROCESSING' ? 'Processing' : lecture.status}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => onDelete(lecture.id, e)}
            className="sm:opacity-0 sm:group-hover:opacity-100 text-tertiary hover:text-red-700"
            aria-label={`Delete ${lecture.title || 'lecture'}`}
          >
            Delete
          </Button>
        </div>
      </div>
    </Link>
  )
}
