import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import Icon from '../components/ui/Icon'
import ProgressRing from '../components/ui/ProgressRing'
import toast from 'react-hot-toast'
import { buildSteps, loadSession, saveSession } from '../lib/studyPath'

const DIFF_COLORS = {
  beginner: 'bg-brand-100 text-brand-800 border-brand-200',
  intermediate: 'bg-brand-200 text-brand-900 border-brand-300',
  advanced: 'bg-brand-800 text-sage-50 border-brand-800',
}

const secondaryButton = 'inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-xl text-sm font-semibold border surface-border text-secondary hover:text-primary hover:border-brand-300 disabled:opacity-40 transition-colors'
const primaryButton = 'inline-flex items-center gap-1.5 min-h-10 px-4 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-paper hover:bg-primary-hover disabled:opacity-40 transition-colors'

export default function StudyPath() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, setGraphData, visitedNodes, setVisitedNodes, markNodeVisited } = useStore()
  const userId = user?.id

  // Restore the saved session once per lecture; a ?target link wins over it.
  const [session, setSession] = useState(() => {
    const saved = loadSession(userId, id)
    const queryTarget = searchParams.get('target')
    return queryTarget && queryTarget !== saved.target
      ? { target: queryTarget, skipped: [], paused: false }
      : saved
  })
  const [selection, setSelection] = useState(session.target)
  const [nodes, setNodes] = useState([])
  const [path, setPath] = useState(null)
  const [graphState, setGraphState] = useState('loading') // loading | ready | error
  const [pathState, setPathState] = useState('idle') // idle | loading | ready | error
  const [busy, setBusy] = useState(false)

  useEffect(() => { saveSession(userId, id, session) }, [userId, id, session])

  // Always load this lecture's graph: the store may hold another lecture's graph.
  const loadGraph = useCallback(async () => {
    setGraphState('loading')
    try {
      const { data } = await api.getGraph(id)
      setNodes(data.nodes || [])
      setGraphData(data)
      setVisitedNodes((data.nodes || []).filter((n) => n.is_visited).map((n) => n.concept_id))
      setGraphState('ready')
    } catch {
      setGraphState('error')
    }
  }, [id, setGraphData, setVisitedNodes])

  useEffect(() => { loadGraph() }, [loadGraph])

  const fetchPath = useCallback(async (target) => {
    setPathState('loading')
    try {
      const { data } = await api.getStudyPath(id, target)
      setPath(data)
      setPathState('ready')
    } catch (e) {
      setPath(null)
      setPathState('error')
      if (e.response?.status === 404) {
        // Saved target no longer exists in this lecture (e.g. regenerated graph).
        setSession({ target: '', skipped: [], paused: false })
        toast.error('That concept is no longer in this lecture')
      } else {
        toast.error(e.response?.data?.detail || 'Failed to generate study path')
      }
    }
  }, [id])

  // Restore the path after refresh, or follow a ?target deep link.
  useEffect(() => {
    if (graphState === 'ready' && session.target && !path && pathState === 'idle') {
      fetchPath(session.target)
    }
  }, [graphState, session.target, path, pathState, fetchPath])

  // Keep the URL shareable and in sync with the active target.
  useEffect(() => {
    const current = searchParams.get('target') || ''
    if (current !== session.target) {
      setSearchParams(session.target ? { target: session.target } : {}, { replace: true })
    }
  }, [session.target, searchParams, setSearchParams])

  const { steps, current, done } = useMemo(
    () => buildSteps(path, visitedNodes, session.skipped),
    [path, visitedNodes, session.skipped]
  )
  const complete = path && steps.length > 0 && current === -1
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0
  const active = current >= 0 ? steps[current] : null

  const start = () => {
    if (!selection) {
      toast.error('Please select a target concept')
      return
    }
    setPath(null)
    setPathState('idle')
    setSession({ target: selection, skipped: [], paused: false })
    fetchPath(selection)
  }

  const reset = () => {
    setPath(null)
    setPathState('idle')
    setSelection('')
    setSession({ target: '', skipped: [], paused: false })
  }

  const completeStep = async (step) => {
    setBusy(true)
    try {
      await api.markVisited(step.concept_id, id)
      markNodeVisited(step.concept_id)
      setSession((s) => ({ ...s, skipped: s.skipped.filter((c) => c !== step.concept_id) }))
      toast.success(step.isTarget ? 'Target reached!' : `${step.name} completed`)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not save progress')
    } finally {
      setBusy(false)
    }
  }

  const undoStep = async (step) => {
    setBusy(true)
    try {
      await api.unmarkVisited(step.concept_id, id)
      setVisitedNodes([...visitedNodes].filter((c) => c !== step.concept_id))
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not undo')
    } finally {
      setBusy(false)
    }
  }

  const skipStep = (step) =>
    setSession((s) => ({ ...s, skipped: [...new Set([...s.skipped, step.concept_id])] }))

  const setPaused = (paused) => setSession((s) => ({ ...s, paused }))

  const targetChoices = nodes.filter((n) => n.difficulty === 'advanced' || n.difficulty === 'intermediate')
  const choices = targetChoices.length ? targetChoices : nodes

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10 animate-fade-in">
      <Link to={`/lectures/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary hover:text-primary">
        <Icon name="arrowLeft" size={15} /> Back to lecture
      </Link>
      <p className="eyebrow mt-5">Prerequisite route</p>
      <h1 className="text-4xl font-semibold text-primary mt-1 mb-6">Study Path</h1>

      <div className="card p-5 sm:p-6 mb-6">
        <p className="text-sm text-secondary mb-4">
          Pick a concept you want to master. LectureMap orders its prerequisites so each step builds on the last.
        </p>

        {graphState === 'loading' ? (
          <div className="flex items-center gap-2 text-sm text-tertiary py-2" role="status">
            <span className="w-4 h-4 border-2 surface-border border-t-brand-700 rounded-full animate-spin" />
            Loading concept graph…
          </div>
        ) : graphState === 'error' ? (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-700">
            <span>Could not load this lecture's concepts.</span>
            <button onClick={loadGraph} className={secondaryButton}>Retry</button>
          </div>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-tertiary py-2">No concepts found for this lecture yet.</p>
        ) : (
          <div className="flex gap-3 max-sm:flex-col">
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              aria-label="Target concept"
              className="field flex-1"
            >
              <option value="">Choose target concept…</option>
              {choices.map((n) => (
                <option key={n.concept_id} value={n.concept_id}>
                  {n.name} ({n.difficulty})
                </option>
              ))}
            </select>
            <button
              onClick={start}
              disabled={pathState === 'loading' || !selection}
              className={`${primaryButton} justify-center h-11`}
            >
              {pathState === 'loading' ? 'Loading…' : session.target && selection === session.target ? 'Restart path' : 'Start path'}
            </button>
          </div>
        )}
      </div>

      {path && (
        <section aria-labelledby="path-heading">
          <div className="card p-5 sm:p-6 mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <ProgressRing percent={percent} size={56} stroke={4} />
              <div className="flex-1 min-w-[10rem]">
                <h2 id="path-heading" className="text-2xl font-semibold text-primary">
                  {path.target?.name || 'Study path'}
                </h2>
                <p className="text-sm text-secondary" aria-live="polite">
                  {done} of {steps.length} step{steps.length !== 1 ? 's' : ''} complete
                  {session.paused && !complete ? ' · paused' : ''}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!complete && (session.paused ? (
                  <button onClick={() => setPaused(false)} className={primaryButton}>
                    <Icon name="play" size={15} /> Resume
                  </button>
                ) : (
                  <button onClick={() => setPaused(true)} className={secondaryButton}>
                    <Icon name="pause" size={15} /> Pause
                  </button>
                ))}
                <button onClick={reset} className={secondaryButton}>Change target</button>
              </div>
            </div>

            {complete ? (
              <div className="mt-5 rounded-xl bg-brand-50 border border-brand-200 p-4" role="status">
                <p className="font-semibold text-brand-900">Path complete.</p>
                <p className="text-sm text-secondary mt-1">
                  You've studied every prerequisite and the target. Review its flashcards to turn this into lasting mastery.
                </p>
                <Link to="/review" className={`${primaryButton} mt-3`}>
                  Review flashcards <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            ) : active && !session.paused ? (
              <div className="mt-5 rounded-xl border border-brand-300 p-4" aria-label="Current step">
                <p className="eyebrow">Step {current + 1} · {active.isTarget ? 'your target' : 'up next'}</p>
                <p className="font-semibold text-primary mt-1">{active.name}</p>
                {active.definition && <p className="text-sm text-secondary mt-1 leading-relaxed">{active.definition}</p>}
                <div className="flex gap-2 flex-wrap mt-3">
                  <button onClick={() => completeStep(active)} disabled={busy} className={primaryButton}>
                    <Icon name="check" size={15} /> {active.isTarget ? 'Complete target' : 'Complete & next'}
                  </button>
                  {!active.isTarget && steps.some((s, i) => i !== current && !s.finished) && (
                    <button onClick={() => skipStep(active)} disabled={busy} className={secondaryButton}>
                      Skip for now
                    </button>
                  )}
                </div>
              </div>
            ) : session.paused ? (
              <p className="mt-5 text-sm text-secondary">Path paused. Your progress is saved — resume any time.</p>
            ) : null}
          </div>

          {steps.length === 1 && !path.path?.length && (
            <p className="text-sm text-tertiary mb-3">This concept has no prerequisites — you can study it directly.</p>
          )}

          <ol className="flex flex-col gap-2" aria-label="Path steps">
            {steps.map((step, i) => (
              <li key={step.concept_id}>
                <div className={`flex items-start gap-4 border rounded-2xl p-4 shadow-paper transition-all ${
                  step.isTarget ? 'ink-panel border-transparent' :
                  step.finished ? 'border-brand-200 bg-brand-50/60' :
                  i === current && !session.paused ? 'surface-card border-brand-400' : 'surface-card surface-border'
                }`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    step.finished ? 'bg-primary text-on-primary' : step.isTarget ? 'bg-accent-500 text-on-accent' : 'bg-slate-100 text-secondary'
                  }`}>
                    {step.finished ? <Icon name="check" size={16} strokeWidth={2.6} label="Done" />
                      : step.isTarget ? <Icon name="target" size={16} label="Target" /> : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className={`font-medium text-sm ${step.isTarget ? 'text-sage-50' : 'text-primary'}`}>{step.name}</p>
                      {step.difficulty && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${DIFF_COLORS[step.difficulty] || DIFF_COLORS.intermediate}`}>
                          {step.difficulty}
                        </span>
                      )}
                      {step.mastered && <span className="text-xs font-semibold text-brand-800">Mastered</span>}
                      {step.skipped && <span className="text-xs text-tertiary">Skipped</span>}
                    </div>
                    {step.definition && (
                      <p className={`text-xs leading-relaxed ${step.isTarget ? 'text-sage-200' : 'text-tertiary'}`}>{step.definition}</p>
                    )}
                  </div>
                  {step.finished && !step.mastered && (
                    <button
                      onClick={() => undoStep(step)}
                      disabled={busy}
                      aria-label={`Undo ${step.name}`}
                      className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-lg ${step.isTarget ? 'text-sage-200 hover:text-sage-50' : 'text-tertiary hover:text-primary'}`}
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
