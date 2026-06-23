import { useMemo } from 'react'

/**
 * Hand-rolled SVG radar chart comparing mastery (% of concepts visited)
 * across the three difficulty tiers for a single lecture's graph. Built
 * from scratch in SVG rather than pulling in a charting library — keeps
 * the bundle small and lets the chart pick up the same CSS-variable
 * theming as the rest of the app for free.
 */
export default function ConceptRadar({ nodes = [], visitedIds = new Set(), size = 220 }) {
  const stats = useMemo(() => {
    const tiers = ['beginner', 'intermediate', 'advanced']
    return tiers.map((tier) => {
      const tierNodes = nodes.filter((n) => n.difficulty === tier)
      const visited = tierNodes.filter((n) => visitedIds.has(n.concept_id)).length
      const pct = tierNodes.length > 0 ? visited / tierNodes.length : 0
      return { tier, total: tierNodes.length, visited, pct }
    })
  }, [nodes, visitedIds])

  const center = size / 2
  const radius = size * 0.34
  const axisCount = stats.length

  // Points for the 3 axes, starting at top (-90deg), going clockwise
  function axisPoint(i, r) {
    const angle = (Math.PI * 2 * i) / axisCount - Math.PI / 2
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
  }

  const ringLevels = [0.25, 0.5, 0.75, 1]
  const dataPath = stats
    .map((s, i) => axisPoint(i, radius * Math.max(s.pct, 0.04)))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ') + ' Z'

  const overallPct = stats.reduce((sum, s) => sum + s.total, 0) > 0
    ? Math.round(
        (stats.reduce((sum, s) => sum + s.visited, 0) /
          stats.reduce((sum, s) => sum + s.total, 0)) * 100
      )
    : 0

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-tertiary" style={{ width: size, height: size }}>
        No concept data
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background rings */}
        {ringLevels.map((level) => {
          const pts = stats.map((_, i) => axisPoint(i, radius * level))
          return (
            <polygon
              key={level}
              points={pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke="var(--surface-border)"
              strokeWidth={1}
            />
          )
        })}

        {/* Axis lines */}
        {stats.map((_, i) => {
          const [x, y] = axisPoint(i, radius)
          return (
            <line
              key={i}
              x1={center} y1={center} x2={x} y2={y}
              stroke="var(--surface-border)"
              strokeWidth={1}
            />
          )
        })}

        {/* Data shape */}
        <path d={dataPath} fill="#4f46e5" fillOpacity={0.18} stroke="#4f46e5" strokeWidth={2} strokeLinejoin="round" />

        {/* Data points */}
        {stats.map((s, i) => {
          const [x, y] = axisPoint(i, radius * Math.max(s.pct, 0.04))
          return <circle key={i} cx={x} cy={y} r={3.5} fill="#4f46e5" />
        })}

        {/* Axis labels */}
        {stats.map((s, i) => {
          const [x, y] = axisPoint(i, radius + 22)
          return (
            <text
              key={i}
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill="var(--text-secondary)"
            >
              {s.tier}
            </text>
          )
        })}

        {/* Center label */}
        <text x={center} y={center - 4} textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--text-primary)">
          {overallPct}%
        </text>
        <text x={center} y={center + 12} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">
          mastered
        </text>
      </svg>

      <div className="flex items-center gap-4 mt-1">
        {stats.map((s) => (
          <div key={s.tier} className="text-center">
            <p className="text-xs font-semibold text-primary">{s.visited}/{s.total}</p>
            <p className="text-[10px] text-tertiary capitalize">{s.tier}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
