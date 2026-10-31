import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import Icon from './Icon'

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'home', label: 'Dashboard' },
  { to: '/review', icon: 'cards', label: 'Review' },
  { to: '/knowledge-map', icon: 'map', label: 'Knowledge Map' },
  { to: '/settings', icon: 'shield', label: 'Settings' },
]

const itemClass = ({ isActive }) =>
  clsx(
    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
    isActive
      ? 'bg-primary text-on-primary font-semibold shadow-paper'
      : 'text-secondary font-medium hover:bg-slate-900/5'
  )

export default function Sidebar({ lectureId }) {
  return (
    <aside className="w-56 border-r surface-border flex flex-col py-5 px-3 shrink-0 hidden lg:flex bg-[var(--surface-bg)]">
      <nav className="flex flex-col gap-1" aria-label="Main">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} className={itemClass}>
            <Icon name={icon} />
            {label}
          </NavLink>
        ))}

        {lectureId && (
          <>
            <p className="eyebrow px-3 mt-6 mb-1 !text-tertiary">Current lecture</p>
            <NavLink to={`/lectures/${lectureId}`} className={itemClass} end>
              <Icon name="graph" />
              Graph view
            </NavLink>
            <NavLink to={`/lectures/${lectureId}/study-path`} className={itemClass}>
              <Icon name="route" />
              Study path
            </NavLink>
          </>
        )}
      </nav>

      <div className="mt-auto px-3 pt-3 text-xs text-tertiary border-t surface-border">
        <kbd className="bg-slate-100 border surface-border rounded-md px-1.5 py-0.5 font-mono">Ctrl K</kbd>{' '}
        to search anything
      </div>
    </aside>
  )
}

const tabClass = ({ isActive }) =>
  clsx(
    'flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors',
    isActive ? 'text-primary font-semibold' : 'text-secondary'
  )

/** Bottom tab bar for screens below the sidebar breakpoint (lg). */
export function MobileNav({ lectureId }) {
  const items = lectureId
    ? [
        { to: '/dashboard', icon: 'home', label: 'Dashboard' },
        { to: `/lectures/${lectureId}`, icon: 'graph', label: 'Graph', end: true },
        { to: `/lectures/${lectureId}/study-path`, icon: 'route', label: 'Path' },
        { to: '/review', icon: 'cards', label: 'Review' },
        { to: '/knowledge-map', icon: 'map', label: 'Map' },
        { to: '/settings', icon: 'shield', label: 'Settings' },
      ]
    : NAV_ITEMS.map((i) => ({ ...i, label: i.label === 'Knowledge Map' ? 'Map' : i.label }))
  return (
    <nav
      aria-label="Mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex border-t surface-border bg-[var(--surface-bg)] pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(({ to, icon, label, end }) => (
        <NavLink key={to} to={to} end={end} className={tabClass}>
          <Icon name={icon} size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
