/**
 * GapOverlay — renders a floating banner + list of knowledge gap nodes
 * that are prerequisites of visited concepts but haven't been studied yet.
 * Consumed by LectureView when the graph tab is active.
 */
export default function GapOverlay({ gaps = [], onNodeClick }) {
  if (!gaps || gaps.length === 0) return null

  return (
    <div className="absolute top-3 left-3 z-20 max-w-xs animate-fade-in">
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-red-100/60 dark:bg-red-900/30 border-b border-red-200 dark:border-red-900">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">
            {gaps.length} knowledge gap{gaps.length !== 1 ? 's' : ''} detected
          </p>
        </div>

        {/* Gap list */}
        <div className="flex flex-col divide-y divide-red-100 dark:divide-red-900/50 max-h-52 overflow-y-auto">
          {gaps.map((node) => (
            <button
              key={node.concept_id}
              onClick={() => onNodeClick?.(node)}
              className="flex items-start gap-2 px-3 py-2 text-left hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0 group-hover:bg-red-600" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-red-800 dark:text-red-300 truncate">{node.name}</p>
                <p className="text-xs text-red-500 dark:text-red-400/80 leading-snug line-clamp-1">
                  {node.definition}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/50">
          <p className="text-xs text-red-400 dark:text-red-500">Click a node to study it first</p>
        </div>
      </div>
    </div>
  )
}
