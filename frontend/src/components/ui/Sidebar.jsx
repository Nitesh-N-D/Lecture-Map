import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/review', icon: '🃏', label: 'Review' },
  { to: '/knowledge-map', icon: '🧩', label: 'Knowledge Map' },
]

const itemClass = ({ isActive }) =>
  clsx(
    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-700 font-medium'
      : 'text-secondary hover:surface-card-hover'
  )

export default function Sidebar({ lectureId }) {
  return (
    <aside className="w-52 surface-card border-r surface-border flex flex-col py-4 px-2 shrink-0 hidden lg:flex transition-colors">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} className={itemClass}>
            <span>{icon}</span>
            {label}
          </NavLink>
        ))}

        {lectureId && (
          <>
            <div className="my-2 border-t surface-border" />
            <p className="px-3 text-xs font-semibold text-tertiary uppercase tracking-wide mb-1">
              Current lecture
            </p>
            <NavLink to={`/lectures/${lectureId}`} className={itemClass} end>
              <span>🕸️</span>
              Graph view
            </NavLink>
            <NavLink to={`/lectures/${lectureId}/study-path`} className={itemClass}>
              <span>🗺️</span>
              Study path
            </NavLink>
          </>
        )}
      </nav>

      {/* Keyboard shortcut hint */}
      <div className="mt-auto px-3 py-2 text-[11px] text-tertiary border-t surface-border pt-3">
        <kbd className="border surface-border rounded px-1 py-0.5 font-mono">⌘K</kbd> to search anything
      </div>
    </aside>
  )
}
