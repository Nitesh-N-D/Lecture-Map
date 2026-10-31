import { useEffect, useState } from 'react'
import { applyTheme, getPreference, resolveTheme, setPreference } from './theme'

export default function useTheme() {
  const [pref, setPref] = useState(getPreference)
  const [theme, setTheme] = useState(() => resolveTheme())

  useEffect(() => {
    const sync = () => {
      setPref(getPreference())
      setTheme(applyTheme())
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    window.addEventListener('lecturemap-theme', sync)
    mq?.addEventListener?.('change', sync)
    return () => {
      window.removeEventListener('lecturemap-theme', sync)
      mq?.removeEventListener?.('change', sync)
    }
  }, [])

  return { pref, theme, setPref: setPreference, toggle: () => setPreference(theme === 'dark' ? 'light' : 'dark') }
}
