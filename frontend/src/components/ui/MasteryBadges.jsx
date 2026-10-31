import Icon from './Icon'

const BADGE_DEFS = [
  { tier: 'beginner', icon: 'seedling', label: 'Foundations', color: 'var(--viz-soft)' },
  { tier: 'intermediate', icon: 'bolt', label: 'Builder', color: 'var(--viz-mid)' },
  { tier: 'advanced', icon: 'trophy', label: 'Master', color: 'var(--viz-main)' },
]

/**
 * Awards a badge per difficulty tier once 100% of that tier's concepts
 * are marked visited for a lecture. Purely derived from existing data
 * (nodes + visitedIds) — no new backend state required.
 */
export default function MasteryBadges({ nodes = [], visitedIds = new Set(), compact = false }) {
  const earned = BADGE_DEFS.map((b) => {
    const tierNodes = nodes.filter((n) => n.difficulty === b.tier)
    const visited = tierNodes.filter((n) => visitedIds.has(n.concept_id)).length
    const complete = tierNodes.length > 0 && visited === tierNodes.length
    return { ...b, complete, total: tierNodes.length, visited }
  })

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {earned.map((b) => (
          <span
            key={b.tier}
            title={`${b.label}: ${b.visited}/${b.total} ${b.tier} concepts studied`}
            className={`transition-all ${b.complete ? '' : 'opacity-25'}`}
            style={{ color: b.color }}
          >
            <Icon name={b.icon} size={16} />
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {earned.map((b) => (
        <div
          key={b.tier}
          className={`flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border bg-[var(--surface-card)] transition-all ${
            b.complete
              ? 'surface-card-hover border-current animate-float'
              : 'surface-border border-dashed'
          }`}
          style={b.complete ? { borderColor: b.color, color: b.color } : {}}
        >
          <Icon name={b.icon} size={24} />
          <span className="text-xs font-semibold text-primary">{b.label}</span>
          <span className="text-xs text-tertiary">{b.visited}/{b.total}</span>
        </div>
      ))}
    </div>
  )
}
