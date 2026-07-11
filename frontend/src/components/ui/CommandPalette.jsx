import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { api } from '../../api/client'

/**
 * Global ⌘K command palette.
 * Fuzzy-searches lectures, concepts (from the currently loaded graph),
 * and exposes quick actions (go to review, toggle theme, etc).
 * Mounted once near the root so it's reachable from anywhere in the app.
 */
export default function CommandPalette() {
  const navigate = useNavigate()
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    isAuthenticated,
    lectures,
    setLectures,
    graphData,
    theme,
    toggleTheme,
  } = useStore()

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  // Global keyboard shortcut: Cmd/Ctrl+K to open, Esc to close
  useEffect(() => {
    const onKeyDown = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isCmdK) {
        e.preventDefault()
        if (!isAuthenticated) return
        setCommandPaletteOpen(!commandPaletteOpen)
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, isAuthenticated, setCommandPaletteOpen])

  // Lazily fetch lectures if the palette opens before Dashboard has loaded them
  useEffect(() => {
    if (commandPaletteOpen && lectures.length === 0) {
      api.getLectures().then(({ data }) => setLectures(data)).catch(() => {})
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [commandPaletteOpen])

  const items = useMemo(() => {
    const results = []

    // Quick actions
    const actions = [
      { type: 'action', icon: '🏠', label: 'Go to Dashboard', run: () => navigate('/dashboard') },
      { type: 'action', icon: '🃏', label: 'Start daily review', run: () => navigate('/review') },
      {
        type: 'action',
        icon: theme === 'dark' ? '☀️' : '🌙',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        run: () => toggleTheme(),
      },
    ]

    // Lectures
    const lectureItems = lectures.map((l) => ({
      type: 'lecture',
      icon: '📄',
      label: l.title || 'Untitled lecture',
      sublabel: `${l.concept_count} concepts · ${l.status}`,
      run: () => navigate(`/lectures/${l.id}`),
    }))

    // Concepts from the currently loaded graph (if any)
    const conceptItems = (graphData?.nodes || []).map((n) => ({
      type: 'concept',
      icon: '🔵',
      label: n.name,
      sublabel: n.difficulty,
      run: () => {
        navigate(`/lectures/${n.lecture_id}`)
      },
    }))

    results.push(...actions, ...lectureItems, ...conceptItems)

    if (!query.trim()) return results.slice(0, 8)

    const q = query.toLowerCase()
    return results
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, lectures, graphData, theme])

  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIdx]
      if (item) {
        item.run()
        setCommandPaletteOpen(false)
      }
    }
  }

  if (!commandPaletteOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 cmdk-overlay"
      style={{ background: 'var(--surface-overlay)' }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg surface-card border surface-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b surface-border">
          <span className="text-tertiary">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search lectures, concepts, or actions…"
            className="flex-1 bg-transparent outline-none text-sm text-primary placeholder:text-tertiary"
          />
          <kbd className="text-[10px] font-mono text-tertiary border surface-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="text-sm text-tertiary text-center py-8">No matches found</p>
          ) : (
            items.map((item, i) => (
              <button
                key={`${item.type}-${item.label}-${i}`}
                onClick={() => {
                  item.run()
                  setCommandPaletteOpen(false)
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === activeIdx ? 'bg-brand-50' : ''
                }`}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-tertiary truncate">{item.sublabel}</p>
                  )}
                </div>
                <span className="text-[10px] uppercase tracking-wide text-tertiary shrink-0">
                  {item.type}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2 border-t surface-border text-[10px] text-tertiary">
          <span className="flex items-center gap-1"><kbd className="border surface-border rounded px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="border surface-border rounded px-1">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="border surface-border rounded px-1">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
