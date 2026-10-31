// Study-path session state. Completion ("studied") is persisted on the server via
// /concepts/{id}/visit; only the learner's chosen target, skipped steps and the
// paused flag live in the browser, keyed per account and lecture.

const PREFIX = 'lecturemap-path'

export function storageKey(userId, lectureId) {
  return `${PREFIX}:${userId || 'anon'}:${lectureId}`
}

const EMPTY = { target: '', skipped: [], paused: false }

export function loadSession(userId, lectureId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, lectureId))
    if (!raw) return { ...EMPTY }
    const data = JSON.parse(raw)
    return {
      target: typeof data.target === 'string' ? data.target : '',
      skipped: Array.isArray(data.skipped) ? data.skipped.filter((s) => typeof s === 'string') : [],
      paused: data.paused === true,
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveSession(userId, lectureId, session) {
  try {
    if (!session.target) {
      window.localStorage.removeItem(storageKey(userId, lectureId))
      return
    }
    window.localStorage.setItem(storageKey(userId, lectureId), JSON.stringify({
      target: session.target,
      skipped: session.skipped || [],
      paused: !!session.paused,
    }))
  } catch {
    // Storage blocked (private mode): the session still works for this page view.
  }
}

/** Remove every saved path for this browser (used on logout / account deletion). */
export function clearAllSessions() {
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(`${PREFIX}:`)) keys.push(key)
    }
    keys.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // ignore
  }
}

/**
 * Ordered steps (prerequisites, then the target itself) with their state, plus the
 * index of the step to work on now: the first unfinished step that was not skipped,
 * falling back to skipped ones so nothing is lost. -1 means the path is complete.
 */
export function buildSteps(pathResponse, visited, skipped) {
  if (!pathResponse) return { steps: [], current: -1, done: 0 }
  const items = [...(pathResponse.path || [])]
  if (pathResponse.target) items.push({ ...pathResponse.target, isTarget: true })
  const skippedSet = new Set(skipped)
  const steps = items.map((node) => {
    const mastered = node.status === 'mastered'
    const finished = mastered || visited.has(node.concept_id)
    return { ...node, finished, mastered, skipped: !finished && skippedSet.has(node.concept_id) }
  })
  let current = steps.findIndex((s) => !s.finished && !s.skipped)
  if (current === -1) current = steps.findIndex((s) => !s.finished)
  return { steps, current, done: steps.filter((s) => s.finished).length }
}
