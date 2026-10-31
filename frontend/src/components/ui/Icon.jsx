// Small stroke icon set (24px grid). Decorative by default; pass `label` to expose one to assistive tech.
const PATHS = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  cards: <><rect x="3" y="6" width="14" height="14" rx="2.5" /><path d="M7 3.5h12A2 2 0 0 1 21 5.5V17" /></>,
  map: <><circle cx="6" cy="6.5" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="10" cy="18" r="2.5" /><path d="m8 8 1.5 7.5M8.4 6.8l7.1.8M16.6 10.2 11.8 16" /></>,
  route: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></>,
  graph: <><circle cx="12" cy="12" r="2.5" /><circle cx="5" cy="5.5" r="1.8" /><circle cx="19" cy="6" r="1.8" /><circle cx="5.5" cy="19" r="1.8" /><circle cx="19" cy="18.5" r="1.8" /><path d="m6.4 6.8 3.8 3.4M17.6 7.3l-3.9 3.1M7 17.7l3.2-3.4M17.7 17.2l-3.5-3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  upload: <><path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  download: <><path d="M12 4v11.5M7.5 11 12 15.5 16.5 11" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  arrowLeft: <path d="M19 12H5m6-6-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  flame: <path d="M12 3c.5 3-3.5 4.6-3.5 9a3.5 3.5 0 0 0 7 0c0-1.2-.4-2-1-2.8.3 2-1 2.8-1.5 2.8C13.5 8.5 14 5.5 12 3Zm-5 10.5C7 17.2 9.2 20 12 20s5-2.8 5-6.5" />,
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" fill="currentColor" /></>,
  sparkle: <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9 12 3.5Zm7 12 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />,
  seedling: <><path d="M12 20v-8" /><path d="M12 12c0-3.5-2.5-5.5-6.5-5.5 0 3.5 2.2 5.5 6.5 5.5Zm0 2c0-3 2.2-5 6.5-5 0 3-2.4 5-6.5 5Z" /></>,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a1 1 0 0 0-1 1c0 2.2 1.6 3.8 4 4M16 6h3a1 1 0 0 1 1 1c0 2.2-1.6 3.8-4 4M12 13v4M8.5 20h7M10 17h4" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  file: <><path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V3.5Z" /><path d="M14 3.5V8h4M9 12.5h6M9 16h6" /></>,
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z" />,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  alert: <><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.6M6.4 7.7A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.8" /></>,
  slash: <><circle cx="12" cy="12" r="7.5" /><path d="m6.7 17.3 10.6-10.6" /></>,
  star: <path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z" />,
  party: <><path d="m4 20 3.5-11 7.5 7.5L4 20Z" /><path d="M13 5.5v.1M18.5 8.5v.1M19 14v.1M16 3.5l1 1.8M20.5 11l1.8-.6" /></>,
}

export default function Icon({ name, size = 18, strokeWidth = 1.8, className = '', label }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name] || null}
    </svg>
  )
}

// Brand mark: a small constellation of linked nodes.
export function LogoMark({ size = 32 }) {
  return (
    <span
      className="grid place-items-center rounded-[10px] bg-primary text-on-primary shadow-glow"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6 16 11 7l7 6" />
        <circle cx="6" cy="16" r="2.4" fill="currentColor" />
        <circle cx="11" cy="7" r="2.4" fill="currentColor" />
        <circle cx="18" cy="13" r="2.4" fill="rgb(var(--on-primary) / 0.55)" stroke="currentColor" />
      </svg>
    </span>
  )
}
