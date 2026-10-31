import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

let openCount = 0

/**
 * Accessible modal dialog.
 *
 * Layout: the backdrop is the scroll container (`overflow-y-auto`) and the panel sits inside a
 * `min-h-full` flex row, so a dialog taller than the viewport scrolls instead of being clipped at
 * the top (the old `fixed inset-0 flex items-center` overlay centred overflow off-screen). The panel
 * also caps its own height and scrolls its body so the submit button stays reachable. It renders in
 * a portal on <body>, so no ancestor transform, filter or backdrop-filter can re-anchor
 * `position: fixed` to that ancestor.
 */
export default function Modal({ open, onClose, labelledBy, children, className = '', initialFocusRef }) {
  const panelRef = useRef(null)
  const returnFocusRef = useRef(null)
  const fallbackId = useId()

  useEffect(() => {
    if (!open) return undefined
    returnFocusRef.current = document.activeElement
    openCount += 1
    if (openCount === 1) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    }
    const target = initialFocusRef?.current || panelRef.current?.querySelector(FOCUSABLE) || panelRef.current
    const t = setTimeout(() => target?.focus(), 0)
    return () => {
      clearTimeout(t)
      openCount -= 1
      if (openCount === 0) {
        document.body.style.overflow = ''
        document.body.style.paddingRight = ''
      }
      const el = returnFocusRef.current
      if (el && document.contains(el)) el.focus()
    }
  }, [open, initialFocusRef])

  if (!open) return null

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose?.()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (nodes.length === 0) {
      e.preventDefault()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const closeOnBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
      style={{ background: 'var(--surface-overlay)' }}
      onMouseDown={closeOnBackdrop}
    >
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6" onMouseDown={closeOnBackdrop}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy || fallbackId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`relative w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-3xl border surface-border surface-card shadow-lift animate-scale-in sm:max-h-[calc(100dvh-3rem)] ${className}`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
