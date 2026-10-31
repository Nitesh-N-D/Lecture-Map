import { useMemo } from 'react'

const STATUS = {
  mastered: { label: 'Mastered', glyph: '★', cls: 'bg-accent-50 text-accent-700 border-accent-200' },
  studied: { label: 'Studied', glyph: '✓', cls: 'bg-brand-50 text-brand-800 border-brand-300' },
  blocked: { label: 'Blocked by prerequisite', glyph: '⊘', cls: 'bg-amber-50 text-amber-900 border-amber-400 border-dashed' },
  unexplored: { label: 'Not studied', glyph: '○', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}

export function conceptStatus(node, visitedIds) {
  if (node.status === 'mastered') return 'mastered'
  if (visitedIds?.has?.(node.concept_id)) return 'studied'
  return node.status === 'blocked' ? 'blocked' : 'unexplored'
}

/**
 * Text alternative to the force-directed graph: works with keyboard and screen
 * readers, and on small screens where dragging a canvas is impractical.
 * Status is always shown as words and a glyph, never colour alone.
 */
export default function ConceptList({ nodes = [], edges = [], visitedIds, onSelect }) {
  const prerequisites = useMemo(() => {
    const names = new Map(nodes.map((n) => [n.concept_id, n.name]))
    const map = new Map()
    for (const e of edges) {
      const from = e.from ?? e.source?.concept_id ?? e.source
      const to = e.to ?? e.target?.concept_id ?? e.target
      if (!map.has(to)) map.set(to, [])
      if (names.has(from)) map.get(to).push(names.get(from))
    }
    return map
  }, [nodes, edges])

  const sorted = useMemo(
    () => [...nodes].sort((a, b) => (a.timestamp_seconds ?? 0) - (b.timestamp_seconds ?? 0) || a.name.localeCompare(b.name)),
    [nodes],
  )

  if (!nodes.length) return null

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-6">
      <h2 className="text-2xl font-semibold text-primary">Concepts</h2>
      <p className="text-sm text-secondary mt-1 mb-4">
        {nodes.length} concepts in the order they appear. Select a concept to read its definition and mark it as studied.
      </p>
      <ul className="grid gap-2 max-w-3xl" aria-label="Concept list">
        {sorted.map((node) => {
          const state = conceptStatus(node, visitedIds)
          const meta = STATUS[state]
          const needs = prerequisites.get(node.concept_id) || []
          return (
            <li key={node.concept_id}>
              <button
                type="button"
                onClick={() => onSelect?.(node)}
                className="w-full text-left card card-interactive w-full px-4 py-3.5 !rounded-xl"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-primary">{node.name}</span>
                  <span className="text-xs text-secondary capitalize">{node.difficulty}</span>
                  <span className={`ml-auto text-xs border rounded-full px-2 py-0.5 ${meta.cls}`}>
                    <span aria-hidden="true">{meta.glyph} </span>
                    {meta.label}
                  </span>
                </span>
                {needs.length > 0 && (
                  <span className="block mt-1 text-xs text-secondary">Builds on: {needs.join(', ')}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
