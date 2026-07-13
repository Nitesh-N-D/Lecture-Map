import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set) => ({
      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),

      logout: () =>
        set({ user: null, token: null, isAuthenticated: false }),

      lectures: [],
      currentLecture: null,

      setLectures: (lectures) => set({ lectures }),

      addLecture: (lecture) =>
        set((state) => ({ lectures: [lecture, ...state.lectures] })),

      updateLecture: (id, updates) =>
        set((state) => ({
          lectures: state.lectures.map((lecture) =>
            lecture.id === id ? { ...lecture, ...updates } : lecture
          ),
          currentLecture:
            state.currentLecture?.id === id
              ? { ...state.currentLecture, ...updates }
              : state.currentLecture,
        })),

      setCurrentLecture: (lecture) => set({ currentLecture: lecture }),

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
        set({ gapNodes: new Set(gaps.map((gap) => gap.concept_id)) }),

      setFilterDifficulty: (difficulty) => set({ filterDifficulty: difficulty }),

      dueCards: [],
      reviewStats: null,

      setDueCards: (cards) => set({ dueCards: cards }),

      removeFromDue: (cardId) =>
        set((state) => ({
          dueCards: state.dueCards.filter((card) => card.id !== cardId),
        })),

      setReviewStats: (stats) => set({ reviewStats: stats }),

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
        activityLog: state.activityLog,
      }),
    }
  )
)

export default useStore
