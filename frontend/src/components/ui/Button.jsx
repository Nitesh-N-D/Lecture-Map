import { cn } from '../../lib/utils'

const variants = {
  default: 'bg-primary text-on-primary shadow-paper hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  outline: 'border border-slate-300 bg-[var(--surface-card)] text-slate-800 shadow-paper hover:border-brand-400 hover:bg-[var(--surface-card)]',
  ghost: 'text-slate-700 hover:bg-slate-900/5 hover:text-slate-950',
  destructive: 'bg-danger text-on-danger shadow-paper hover:opacity-90',
  accent: 'bg-accent-500 text-on-accent shadow-paper hover:bg-accent-400',
}

const sizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3.5',
  lg: 'h-12 px-7 text-base',
  icon: 'h-10 w-10',
}

export default function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:pointer-events-none disabled:opacity-50',
        variants[variant] || variants.default,
        sizes[size] || sizes.default,
        className
      )}
      {...props}
    />
  )
}
