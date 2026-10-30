import axios from 'axios'
import useStore from '../store/useStore'

// Local development falls back to the dev API; a production build must set VITE_API_URL
// (an empty base means same-origin, e.g. behind a reverse proxy).
export const API_BASE = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/$/, '')

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

// Attach the session token from the store.
client.interceptors.request.use((config) => {
  const { token } = useStore.getState()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// An expired or revoked session signs the user out through the store. Route guards
// then send them to the landing page; there is no hard reload, so no redirect loop.
// Requests made without a token (login attempts, public calls) never trigger this.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const sentToken = Boolean(err.config?.headers?.Authorization)
    if (err.response?.status === 401 && sentToken && !err.config?.skipAuthRedirect) {
      const { isAuthenticated, logout } = useStore.getState()
      if (isAuthenticated) logout()
    }
    return Promise.reject(err)
  }
)

/** A short, user-presentable message for any failed API call. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
  if (!err?.response) return 'Cannot reach the server. Check your connection and try again.'
  const { status, data } = err.response
  const detail = typeof data?.detail === 'string' ? data.detail : null
  const ref = data?.request_id ? ` (ref ${String(data.request_id).slice(0, 8)})` : ''
  if (status === 429) return `${detail || 'Too many requests.'} Please wait a moment.`
  if (status >= 500) return `${detail || fallback}${ref}`
  return detail || fallback
}

// ── API methods ───────────────────────────────────────────────────────────────

export const api = {
  // Auth
  guestLogin: () => client.post('/auth/guest'),
  logout: () => client.post('/auth/logout'),
  signup: (email, password, name) => client.post('/auth/signup', { email, password, name }),
  login: (email, password) => client.post('/auth/login', { email, password }),
  getMe: () => client.get('/auth/me'),
  exportMyData: () => client.get('/auth/me/export', { responseType: 'blob' }),
  deleteAccount: (password) =>
    client.delete('/auth/me', { data: { confirm: 'DELETE', password } }),

  // Lectures
  getLectures: () => client.get('/lectures'),
  getLecture: (id) => client.get(`/lectures/${id}`),
  getLectureStatus: (id) => client.get(`/lectures/${id}/status`),
  uploadLecture: (formData) =>
    client.post('/lectures/upload', formData, {
      timeout: 120000,
    }),
  deleteLecture: (id) => client.delete(`/lectures/${id}`),
  retryLecture: (id) => client.post(`/lectures/${id}/retry`),

  // Graph
  getGraph: (lectureId) => client.get(`/lectures/${lectureId}/graph`),
  getGaps: (lectureId) => client.get(`/lectures/${lectureId}/graph/gaps`),
  getConcept: (conceptId, lectureId) =>
    client.get(`/concepts/${conceptId}`, { params: { lecture_id: lectureId } }),
  markVisited: (conceptId, lectureId) =>
    client.post(`/concepts/${conceptId}/visit`, null, { params: { lecture_id: lectureId } }),
  unmarkVisited: (conceptId, lectureId) =>
    client.delete(`/concepts/${conceptId}/visit`, { params: { lecture_id: lectureId } }),
  getStudyPath: (lectureId, targetConceptId) =>
    client.get(`/lectures/${lectureId}/study-path`, {
      params: { target: targetConceptId },
    }),
  getKnowledgeMap: () => client.get('/knowledge-map'),

  // Flashcards
  getFlashcards: (lectureId) => client.get(`/lectures/${lectureId}/flashcards`),
  getDueCards: () => client.get('/review/due'),
  reviewCard: (cardId, quality) => client.post(`/review/${cardId}`, { quality }),
  getReviewStats: () => client.get('/review/stats'),

  // Export
  exportAnki: (lectureId) =>
    client.get(`/export/anki/${lectureId}`, { responseType: 'blob' }),
  exportPdf: (lectureId) =>
    client.get(`/export/pdf/${lectureId}`, { responseType: 'blob' }),
}

export default client
