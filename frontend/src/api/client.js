import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const client = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

// Attach JWT token from store
client.interceptors.request.use((config) => {
  // Get token from persisted Zustand store
  try {
    const raw = localStorage.getItem('lecturemap-store')
    if (raw) {
      const { state } = JSON.parse(raw)
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`
      }
    }
  } catch (_) {}
  return config
})

// Handle 401 → logout
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('lecturemap-store')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ── API methods ───────────────────────────────────────────────────────────────

export const api = {
  // Auth
  guestLogin: () => client.post('/auth/guest'),
  signup: (email, password, name) => client.post('/auth/signup', { email, password, name }),
  login: (email, password) => client.post('/auth/login', { email, password }),
  getMe: () => client.get('/auth/me'),

  // Lectures
  getLectures: () => client.get('/lectures'),
  getLecture: (id) => client.get(`/lectures/${id}`),
  getLectureStatus: (id) => client.get(`/lectures/${id}/status`),
  uploadLecture: (formData) =>
    client.post('/lectures/upload', formData, {
      timeout: 120000,
    }),
  addYouTubeLecture: (url, title) =>
    client.post('/lectures/youtube', { url, title }),
  deleteLecture: (id) => client.delete(`/lectures/${id}`),

  // Graph
  getGraph: (lectureId) => client.get(`/lectures/${lectureId}/graph`),
  getGaps: (lectureId) => client.get(`/lectures/${lectureId}/graph/gaps`),
  getConcept: (conceptId, lectureId) =>
    client.get(`/concepts/${conceptId}`, { params: { lecture_id: lectureId } }),
  markVisited: (conceptId, lectureId) =>
    client.post(`/concepts/${conceptId}/visit`, null, { params: { lecture_id: lectureId } }),
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
