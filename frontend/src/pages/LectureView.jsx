import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import ConceptGraph from '../components/graph/ConceptGraph'
import NodePanel from '../components/graph/NodePanel'
import GapOverlay from '../components/graph/GapOverlay'
import FlashcardDeck from '../components/flashcards/FlashcardDeck'
import ConceptRadar from '../components/ui/ConceptRadar'
import MasteryBadges from '../components/ui/MasteryBadges'
import toast from 'react-hot-toast'

const TABS = ['Graph', 'Flashcards', 'Insights', 'Transcript']

export default function LectureView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setGraphData, setSelectedNode, selectedNode, setGapNodes, graphData, visitedNodes, logActivity } = useStore()
  const [lecture, setLecture] = useState(null)
  const [flashcards, setFlashcards] = useState([])
  const [rawGaps, setRawGaps] = useState([])
  const [tab, setTab] = useState('Graph')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(null)

  useEffect(() => {
    loadAll()
  }, [id])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [lectureRes, graphRes, flashRes, gapsRes] = await Promise.allSettled([
        api.getLecture(id),
        api.getGraph(id),
        api.getFlashcards(id),
        api.getGaps(id),
      ])

      if (lectureRes.status === 'fulfilled') setLecture(lectureRes.value.data)
      if (graphRes.status === 'fulfilled') {
        const g = graphRes.value.data
        // Normalise edge keys for D3 (from/to → source/target handled in component)
        setGraphData(g)
      }
      if (flashRes.status === 'fulfilled') setFlashcards(flashRes.value.data)
      if (gapsRes.status === 'fulfilled') {
        const gaps = gapsRes.value.data.gaps || []
        setGapNodes(gaps)
        setRawGaps(gaps)
      }
    } catch (e) {
      toast.error('Failed to load lecture')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (type) => {
    setExporting(type)
    try {
      const res = type === 'anki' ? await api.exportAnki(id) : await api.exportPdf(id)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${lecture?.title || 'lecture'}.${type === 'anki' ? 'apkg' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${type.toUpperCase()} exported!`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-tertiary">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm">Loading lecture…</p>
        </div>
      </div>
    )
  }

  if (!lecture) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center text-tertiary">
        <p className="text-4xl mb-4">🔍</p>
        <p className="font-medium text-secondary mb-2">Lecture not found</p>
        <button onClick={() => navigate('/dashboard')} className="text-sm text-brand-600 hover:text-brand-700 mt-2">
          ← Back to dashboard
        </button>
      </div>
    )
  }

  const dueCards = flashcards.filter(c => new Date(c.next_review_at) <= new Date())

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Lecture header */}
      <div className="px-4 py-3 border-b surface-border surface-card flex items-center gap-4 shrink-0 transition-colors">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-tertiary hover:text-secondary text-sm"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-primary truncate">
            {lecture.title || 'Untitled lecture'}
          </h1>
          <p className="text-xs text-tertiary mt-0.5">
            {graphData?.nodes?.length || 0} concepts · {graphData?.edges?.length || 0} edges · {flashcards.length} flashcards
          </p>
        </div>

        {/* Mastery badges (compact, header-friendly) */}
        {graphData?.nodes?.length > 0 && (
          <div className="hidden md:block shrink-0">
            <MasteryBadges nodes={graphData.nodes} visitedIds={visitedNodes} compact />
          </div>
        )}

        {/* Export buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {dueCards.length > 0 && (
            <span className="text-xs bg-brand-50 text-brand-600 border border-brand-200 px-2 py-1 rounded-full font-medium">
              {dueCards.length} due
            </span>
          )}
          <button
            onClick={() => navigate(`/lectures/${id}/study-path`)}
            className="text-xs border surface-border text-secondary px-3 py-1.5 rounded-lg hover:surface-card-hover transition-colors"
          >
            🗺️ Study path
          </button>
          <button
            onClick={() => handleExport('anki')}
            disabled={!!exporting}
            className="text-xs border surface-border text-secondary px-3 py-1.5 rounded-lg hover:surface-card-hover disabled:opacity-40 transition-colors"
          >
            {exporting === 'anki' ? '…' : '↓ Anki'}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            className="text-xs border surface-border text-secondary px-3 py-1.5 rounded-lg hover:surface-card-hover disabled:opacity-40 transition-colors"
          >
            {exporting === 'pdf' ? '…' : '↓ PDF'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b surface-border surface-card shrink-0 px-4 transition-colors">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-secondary hover:text-primary'
            }`}
          >
            {t}
            {t === 'Flashcards' && dueCards.length > 0 && (
              <span className="ml-1.5 text-xs bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full">
                {dueCards.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden relative">
        {tab === 'Graph' && (
          <div className="flex h-full">
            <div className="flex-1 overflow-hidden relative">
              {rawGaps.length > 0 && (
                <GapOverlay
                  gaps={rawGaps}
                  onNodeClick={(node) => setSelectedNode(node)}
                />
              )}
              {graphData && graphData.nodes?.length > 0 ? (
                <ConceptGraph
                  data={graphData}
                  onNodeSelect={setSelectedNode}
                  lectureId={id}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-tertiary">
                  <div className="text-center">
                    <p className="text-4xl mb-3">🕸️</p>
                    <p className="text-sm font-medium text-secondary">No graph data</p>
                    <p className="text-xs mt-1">
                      {lecture.status === 'PROCESSING'
                        ? 'Still processing — check back in a moment'
                        : lecture.status === 'FAILED'
                        ? `Processing failed: ${lecture.error_message}`
                        : 'Graph not yet generated'}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {selectedNode && (
              <NodePanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                lectureId={id}
              />
            )}
          </div>
        )}

        {tab === 'Flashcards' && (
          <div className="flex flex-col items-center py-10 px-4 h-full overflow-y-auto">
            {flashcards.length === 0 ? (
              <div className="text-center text-tertiary py-16">
                <p className="text-4xl mb-3">🃏</p>
                <p className="font-medium text-secondary mb-1">No flashcards yet</p>
                <p className="text-xs">Flashcards are generated after the lecture is processed</p>
              </div>
            ) : dueCards.length > 0 ? (
              <FlashcardDeck
                cards={dueCards}
                onComplete={() => {
                  logActivity(dueCards.length)
                  toast.success('Review session done!')
                  loadAll()
                }}
              />
            ) : (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-medium text-primary mb-1">All caught up!</p>
                <p className="text-sm text-tertiary">No cards due right now. Come back later.</p>
                <div className="mt-6 grid grid-cols-1 gap-2 w-full max-w-md">
                  {flashcards.slice(0, 5).map((card) => (
                    <div key={card.id} className="surface-card border surface-border rounded-lg p-3 text-left">
                      <p className="text-xs text-tertiary mb-1">{card.concept_name}</p>
                      <p className="text-sm text-secondary">{card.question}</p>
                    </div>
                  ))}
                  {flashcards.length > 5 && (
                    <p className="text-xs text-tertiary text-center mt-1">
                      +{flashcards.length - 5} more cards
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'Insights' && (
          <div className="h-full overflow-y-auto px-6 py-8">
            {graphData?.nodes?.length > 0 ? (
              <div className="max-w-3xl mx-auto flex flex-col gap-8">
                <div>
                  <h2 className="text-base font-semibold text-primary mb-1">Mastery by difficulty</h2>
                  <p className="text-xs text-tertiary mb-4">
                    Percentage of concepts you've marked as studied in each tier
                  </p>
                  <div className="surface-card border surface-border rounded-xl p-6 flex items-center justify-center">
                    <ConceptRadar nodes={graphData.nodes} visitedIds={visitedNodes} size={240} />
                  </div>
                </div>

                <div>
                  <h2 className="text-base font-semibold text-primary mb-1">Achievements</h2>
                  <p className="text-xs text-tertiary mb-4">
                    Earned by marking every concept in a tier as studied
                  </p>
                  <div className="surface-card border surface-border rounded-xl p-6">
                    <MasteryBadges nodes={graphData.nodes} visitedIds={visitedNodes} />
                  </div>
                </div>

                {rawGaps.length > 0 && (
                  <div>
                    <h2 className="text-base font-semibold text-primary mb-1">Knowledge gaps</h2>
                    <p className="text-xs text-tertiary mb-4">
                      Prerequisites you haven't studied yet, but that later concepts depend on
                    </p>
                    <div className="flex flex-col gap-2">
                      {rawGaps.map((g) => (
                        <button
                          key={g.concept_id}
                          onClick={() => { setTab('Graph'); setSelectedNode(g) }}
                          className="flex items-center gap-2 text-left surface-card border border-red-200 rounded-lg px-3 py-2.5 hover:bg-red-50 transition-colors"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          <span className="text-sm text-secondary">{g.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-tertiary py-20">
                <p className="text-4xl mb-3">📊</p>
                <p className="text-sm">No graph data to build insights from yet</p>
              </div>
            )}
          </div>
        )}

        {tab === 'Transcript' && (
          <div className="h-full overflow-y-auto px-6 py-6 max-w-3xl mx-auto w-full">
            {lecture.transcript ? (
              <div>
                <h2 className="text-base font-semibold text-primary mb-4">Full Transcript</h2>
                <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                  {lecture.transcript}
                </p>
              </div>
            ) : (
              <div className="text-center text-tertiary py-20">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm">Transcript not available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
