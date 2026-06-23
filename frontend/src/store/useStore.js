import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set, get) => ({
      // ── Theme ─────────────────────────────────────────────────────────
      theme: 'light', // 'light' | 'dark'

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        document.documentElement.classList.toggle('dark', next === 'dark')
      },

      // ── Command palette ───────────────────────────────────────────────
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      // ── Auth ──────────────────────────────────────────────────────────
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),

      logout: () =>
        set({ user: null, token: null, isAuthenticated: false }),

      // ── Lectures ──────────────────────────────────────────────────────
      lectures: [],
      currentLecture: null,

      setLectures: (lectures) => set({ lectures }),

      addLecture: (lecture) =>
        set((state) => ({ lectures: [lecture, ...state.lectures] })),

      updateLecture: (id, updates) =>
        set((state) => ({
          lectures: state.lectures.map((l) =>
            l.id === id ? { ...l, ...updates } : l
          ),
          currentLecture:
            state.currentLecture?.id === id
              ? { ...state.currentLecture, ...updates }
              : state.currentLecture,
        })),

      setCurrentLecture: (lecture) => set({ currentLecture: lecture }),

      // ── Graph ─────────────────────────────────────────────────────────
      graphData: null,
      selectedNode: null,
      visitedNodes: new Set(),
      gapNodes: new Set(),
      filterDifficulty: 'all',

      setGraphData: (data) => set({ graphData: data }),

      setSelectedNode: (node) => set({ selectedNode: node }),

      markNodeVisited: (conceptId) =>
        set((state) => ({
          visitedNodes: new Set([...state.visitedNodes, conceptId]),
        })),

      setGapNodes: (gaps) =>
        set({ gapNodes: new Set(gaps.map((g) => g.concept_id)) }),

      setFilterDifficulty: (diff) => set({ filterDifficulty: diff }),

      // ── Flashcards ────────────────────────────────────────────────────
      dueCards: [],
      reviewStats: null,

      setDueCards: (cards) => set({ dueCards: cards }),

      removeFromDue: (cardId) =>
        set((state) => ({
          dueCards: state.dueCards.filter((c) => c.id !== cardId),
        })),

      setReviewStats: (stats) => set({ reviewStats: stats }),

      // ── Activity log (for mastery heatmap) ──────────────────────────────
      // Local-first record of {dateISO: count} so the heatmap renders
      // instantly without waiting on a dedicated backend aggregation route.
      activityLog: {},

      logActivity: (count = 1) =>
        set((state) => {
          const today = new Date().toISOString().slice(0, 10)
          return {
            activityLog: {
              ...state.activityLog,
              [today]: (state.activityLog[today] || 0) + count,
            },
          }
        }),
    }),
    {
      name: 'lecturemap-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        activityLog: state.activityLog,
      }),
    }
  )
)

export default useStore
