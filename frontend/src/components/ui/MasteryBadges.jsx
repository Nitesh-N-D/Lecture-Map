const BADGE_DEFS = [
  { tier: 'beginner', icon: '🌱', label: 'Foundations', color: '#4ade80' },
  { tier: 'intermediate', icon: '⚡', label: 'Builder', color: '#60a5fa' },
  { tier: 'advanced', icon: '🏆', label: 'Master', color: '#f472b6' },
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
            className={`text-sm transition-all ${b.complete ? '' : 'opacity-20 grayscale'}`}
          >
            {b.icon}
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
          className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all ${
            b.complete
              ? 'surface-card-hover border-current animate-float'
              : 'surface-border opacity-40'
          }`}
          style={b.complete ? { borderColor: b.color, color: b.color } : {}}
        >
          <span className="text-xl">{b.icon}</span>
          <span className="text-[10px] font-semibold text-primary">{b.label}</span>
          <span className="text-[10px] text-tertiary">{b.visited}/{b.total}</span>
        </div>
      ))}
    </div>
  )
}
