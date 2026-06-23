/**
 * Client-side SM-2 preview helpers (for UI display only — server does real computation)
 */

export function getDueLabel(nextReviewAt) {
  const now = new Date()
  const due = new Date(nextReviewAt)
  const diffMs = due - now

  if (diffMs <= 0) return 'Due now'
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays < 7) return `Due in ${diffDays} days`
  if (diffDays < 30) return `Due in ${Math.ceil(diffDays / 7)} weeks`
  return `Due in ${Math.ceil(diffDays / 30)} months`
}

export function getEasinessLabel(ef) {
  if (ef >= 2.5) return 'Easy'
  if (ef >= 2.0) return 'Medium'
  if (ef >= 1.5) return 'Hard'
  return 'Very hard'
}

export function getEasinessColor(ef) {
  if (ef >= 2.5) return '#4ade80'
  if (ef >= 2.0) return '#facc15'
  return '#f87171'
}

export const QUALITY_LABELS = {
  0: { label: 'Again', color: '#ef4444', description: 'Completely forgot' },
  2: { label: 'Hard', color: '#f97316', description: 'Significant difficulty' },
  3: { label: 'Good', color: '#3b82f6', description: 'Recalled with some effort' },
  5: { label: 'Easy', color: '#22c55e', description: 'Perfect recall' },
}

export function formatInterval(days) {
  if (days === 1) return '1 day'
  if (days < 7) return `${days} days`
  if (days < 30) return `${Math.round(days / 7)} week${days >= 14 ? 's' : ''}`
  return `${Math.round(days / 30)} month${days >= 60 ? 's' : ''}`
}
