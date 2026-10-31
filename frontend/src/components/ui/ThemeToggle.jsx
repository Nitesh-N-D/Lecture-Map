import useTheme from '../../lib/useTheme'
import Icon from './Icon'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-300 text-slate-700 transition-colors hover:border-brand-400 hover:text-slate-950 ${className}`}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  )
}
