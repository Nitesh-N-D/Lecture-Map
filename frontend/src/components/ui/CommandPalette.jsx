import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useStore from '../../store/useStore'
import { api } from '../../api/client'

export default function CommandPalette() {
  const navigate = useNavigate()
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    isAuthenticated,
    lectures,
    setLectures,
    graphData,
  } = useStore()

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

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

  useEffect(() => {
    if (commandPaletteOpen && lectures.length === 0) {
      api.getLectures().then(({ data }) => setLectures(data)).catch(() => {})
    }
  }, [commandPaletteOpen, lectures.length, setLectures])

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [commandPaletteOpen])

  const items = useMemo(() => {
    const actions = [
      { type: 'action', label: 'Go to dashboard', run: () => navigate('/dashboard') },
      { type: 'action', label: 'Start daily review', run: () => navigate('/review') },
      { type: 'action', label: 'Open knowledge map', run: () => navigate('/knowledge-map') },
    ]

    const lectureItems = lectures.map((lecture) => ({
      type: 'lecture',
      label: lecture.title || 'Untitled lecture',
      sublabel: `${lecture.concept_count} concepts - ${lecture.status}`,
      run: () => navigate(`/lectures/${lecture.id}`),
    }))

    const conceptItems = (graphData?.nodes || []).map((node) => ({
      type: 'concept',
      label: node.name,
      sublabel: node.difficulty,
      run: () => navigate(`/lectures/${node.lecture_id}`),
    }))

    const results = [...actions, ...lectureItems, ...conceptItems]
    if (!query.trim()) return results.slice(0, 8)

    const q = query.toLowerCase()
    return results
      .filter((item) => item.label.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, lectures, graphData, navigate])

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
        className="w-full max-w-lg surface-card border surface-border rounded-xl shadow-2xl overflow-hidden animate-scale-in"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b surface-border">
          <span className="text-xs font-semibold text-brand-600">Search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search lectures, concepts, or actions"
            className="flex-1 bg-transparent outline-none text-sm text-primary"
          />
          <kbd className="text-[10px] font-mono text-tertiary border surface-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

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

        <div className="flex items-center gap-4 px-4 py-2 border-t surface-border text-[10px] text-tertiary">
          <span>arrows navigate</span>
          <span>enter selects</span>
          <span>esc closes</span>
        </div>
      </div>
    </div>
  )
}
