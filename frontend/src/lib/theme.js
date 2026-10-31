// Theme preference: 'light' | 'dark' | 'system'. The inline script in index.html applies the
// stored choice before first paint; this module keeps it in sync afterwards.
const KEY = 'lecturemap-theme'
const COLORS = { light: '#f3f8f1', dark: '#102a22' }

export function getPreference() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(pref = getPreference()) {
  if (pref === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function applyTheme(pref = getPreference()) {
  const theme = resolveTheme(pref)
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme])
  return theme
}

export function setPreference(pref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Storage can be blocked; the theme still applies for this page view.
  }
  window.dispatchEvent(new Event('lecturemap-theme'))
  return applyTheme(pref)
}
