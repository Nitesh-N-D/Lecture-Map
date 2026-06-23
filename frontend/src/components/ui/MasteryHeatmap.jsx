import { useMemo, useState } from 'react'

/**
 * GitHub-contributions-style activity heatmap built from the local
 * activityLog kept in the Zustand store (logged on every flashcard
 * review). Pure client-side — no backend aggregation needed, and it
 * renders instantly since it never blocks on a network round trip.
 */
export default function MasteryHeatmap({ activityLog = {} }) {
  const [hovered, setHovered] = useState(null)

  const { weeks, maxCount, totalDays, totalReviews } = useMemo(() => {
    const today = new Date()
    const days = []
    // 18 weeks back (~126 days) — enough to read as a real habit tracker
    // without overwhelming a dashboard widget.
    for (let i = 125; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      days.push({ date: iso, count: activityLog[iso] || 0, dow: d.getDay() })
    }

    // Group into weeks (columns), Sunday-start
    const weeks = []
    let week = new Array(7).fill(null)
    days.forEach((day) => {
      week[day.dow] = day
      if (day.dow === 6) {
        weeks.push(week)
        week = new Array(7).fill(null)
      }
    })
    if (week.some((d) => d)) weeks.push(week)

    const counts = days.map((d) => d.count)
    const maxCount = Math.max(1, ...counts)
    const totalDays = days.filter((d) => d.count > 0).length
    const totalReviews = counts.reduce((a, b) => a + b, 0)

    return { weeks, maxCount, totalDays, totalReviews }
  }, [activityLog])

  function intensity(count) {
    if (count === 0) return 'level-0'
    const ratio = count / maxCount
    if (ratio > 0.75) return 'level-4'
    if (ratio > 0.5) return 'level-3'
    if (ratio > 0.25) return 'level-2'
    return 'level-1'
  }

  const LEVEL_COLORS = {
    'level-0': 'var(--surface-border)',
    'level-1': '#a7f3d0',
    'level-2': '#4ade80',
    'level-3': '#16a34a',
    'level-4': '#15803d',
  }

  return (
    <div className="surface-card border surface-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-primary">Study activity</p>
          <p className="text-xs text-tertiary mt-0.5">
            {totalReviews} reviews across {totalDays} active days
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-tertiary">
          <span>Less</span>
          {['level-0', 'level-1', 'level-2', 'level-3', 'level-4'].map((l) => (
            <span
              key={l}
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: LEVEL_COLORS[l] }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) =>
              day ? (
                <div
                  key={di}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  className="w-[11px] h-[11px] rounded-sm cursor-pointer transition-transform hover:scale-125"
                  style={{ background: LEVEL_COLORS[intensity(day.count)] }}
                />
              ) : (
                <div key={di} className="w-[11px] h-[11px]" />
              )
            )}
          </div>
        ))}
      </div>

      <div className="h-5 mt-1.5">
        {hovered && (
          <p className="text-xs text-secondary animate-fade-in">
            <span className="font-medium text-primary">{hovered.count} review{hovered.count !== 1 ? 's' : ''}</span>
            {' '}on {formatDate(hovered.date)}
          </p>
        )}
      </div>
    </div>
  )
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
