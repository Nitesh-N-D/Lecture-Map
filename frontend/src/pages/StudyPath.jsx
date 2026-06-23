import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import toast from 'react-hot-toast'

const DIFF_COLORS = {
  beginner: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900',
  intermediate: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  advanced: 'bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400 border-pink-200 dark:border-pink-900',
}

export default function StudyPath() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { graphData, setGraphData, visitedNodes, markNodeVisited } = useStore()
  const [path, setPath] = useState(null)
  const [targetId, setTargetId] = useState(searchParams.get('target') || '')
  const [loading, setLoading] = useState(false)
  const [graphLoading, setGraphLoading] = useState(false)

  // Fetch graph data directly if the user landed here without first
  // visiting the LectureView graph tab (e.g. bookmark, sidebar link, refresh).
  useEffect(() => {
    if (graphData?.nodes?.length > 0) return
    const loadGraph = async () => {
      setGraphLoading(true)
      try {
        const { data } = await api.getGraph(id)
        setGraphData(data)
      } catch {
        toast.error('Failed to load concept graph')
      } finally {
        setGraphLoading(false)
      }
    }
    loadGraph()
  }, [id])

  const nodes = graphData?.nodes || []

  // If a target concept arrived via query param (e.g. "Add to study path"
  // from NodePanel), auto-generate the path as soon as the graph is ready
  // instead of making the user re-select it from the dropdown.
  useEffect(() => {
    const queryTarget = searchParams.get('target')
    if (queryTarget && nodes.length > 0 && !path && !loading) {
      setTargetId(queryTarget)
      handleGenerate(queryTarget)
    }
  }, [nodes.length])

  const handleGenerate = async (overrideId) => {
    const useId = overrideId || targetId
    if (!useId) {
      toast.error('Please select a target concept')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.getStudyPath(id, useId)
      setPath(data)
    } catch {
      toast.error('Failed to generate study path')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkStudied = async (conceptId) => {
    try {
      await api.markVisited(conceptId)
      markNodeVisited(conceptId)
      toast.success('Marked as studied!')
    } catch {
      toast.error('Failed to mark studied')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/lectures/${id}`} className="text-tertiary hover:text-secondary text-sm">
          ← Back to lecture
        </Link>
        <h1 className="text-2xl font-bold text-primary">Study Path</h1>
      </div>

      <div className="surface-card border surface-border rounded-xl p-5 mb-6">
        <p className="text-sm text-secondary mb-4">
          Select a concept you want to master. LectureMap will show you the optimal prerequisite path to get there.
        </p>

        {graphLoading ? (
          <div className="flex items-center gap-2 text-sm text-tertiary py-2">
            <span className="w-4 h-4 border-2 surface-border border-t-brand-500 rounded-full animate-spin" />
            Loading concept graph…
          </div>
        ) : nodes.length === 0 ? (
          <p className="text-sm text-tertiary py-2">
            No concepts found for this lecture yet.
          </p>
        ) : (
          <div className="flex gap-3">
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="flex-1 surface-bg border surface-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900 text-primary"
            >
              <option value="">Choose target concept…</option>
              {nodes
                .filter((n) => n.difficulty === 'advanced' || n.difficulty === 'intermediate')
                .map((n) => (
                  <option key={n.concept_id} value={n.concept_id}>
                    {n.name} ({n.difficulty})
                  </option>
                ))}
            </select>
            <button
              onClick={() => handleGenerate()}
              disabled={loading || !targetId}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              {loading ? '…' : 'Generate path'}
            </button>
          </div>
        )}
      </div>

      {path && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">
              {path.total_steps} step{path.total_steps !== 1 ? 's' : ''} to master this concept
            </h2>
            <span className="text-xs text-tertiary">
              {path.path.filter((n) => visitedNodes.has(n.concept_id)).length} / {path.total_steps} done
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {path.path.map((node, i) => {
              const visited = visitedNodes.has(node.concept_id)
              return (
                <div key={node.concept_id} className="relative">
                  <div className={`flex items-start gap-4 surface-card border rounded-xl p-4 transition-all ${
                    visited ? 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10' : 'surface-border hover:border-brand-200 dark:hover:border-brand-800'
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                      visited ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' : 'surface-bg text-secondary'
                    }`}>
                      {visited ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-primary text-sm">{node.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${DIFF_COLORS[node.difficulty] || DIFF_COLORS.intermediate}`}>
                          {node.difficulty}
                        </span>
                      </div>
                      <p className="text-xs text-tertiary leading-relaxed">{node.definition}</p>
                    </div>
                    {!visited && (
                      <button
                        onClick={() => handleMarkStudied(node.concept_id)}
                        className="shrink-0 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 font-medium border border-brand-200 dark:border-brand-900 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Mark done
                      </button>
                    )}
                  </div>
                  {i < path.path.length - 1 && (
                    <div className="w-px h-3 bg-[var(--surface-border-strong)] ml-8" />
                  )}
                </div>
              )
            })}

            {/* Target node */}
            <div className="relative">
              <div className="w-px h-3 bg-[var(--surface-border-strong)] ml-8" />
              <div className="flex items-start gap-4 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-900 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-400 flex items-center justify-center text-sm font-semibold shrink-0">
                  🎯
                </div>
                <div>
                  <p className="font-semibold text-brand-900 dark:text-brand-300 text-sm">
                    {nodes.find((n) => n.concept_id === targetId)?.name || 'Target concept'}
                  </p>
                  <p className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Your goal</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
