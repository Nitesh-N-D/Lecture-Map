import { describe, it, expect, beforeEach } from 'vitest'
import useStore from '../store/useStore'

beforeEach(() => useStore.setState({ user: null, token: null, isAuthenticated: false, activityLog: {} }))

describe('auth store', () => {
  it('stores and clears the session', () => {
    useStore.getState().setAuth({ id: 'u1' }, 'tok')
    expect(useStore.getState()).toMatchObject({ isAuthenticated: true, token: 'tok' })
    useStore.getState().logout()
    expect(useStore.getState()).toMatchObject({ isAuthenticated: false, token: null, user: null })
  })

  it('leaves no activity or study state behind after logout', () => {
    const s = useStore.getState()
    s.setAuth({ id: 'u1' }, 'tok')
    s.logActivity(3)
    s.setVisitedNodes(['a'])
    s.logout()
    expect(useStore.getState().activityLog).toEqual({})
    expect(useStore.getState().visitedNodes.size).toBe(0)
  })

  it('persists only the session and activity, never lecture content', () => {
    useStore.getState().setAuth({ id: 'u1' }, 'tok')
    useStore.getState().setGraphData({ nodes: [{ concept_id: 'secret' }] })
    const saved = JSON.parse(localStorage.getItem('lecturemap-store')).state
    expect(Object.keys(saved).sort()).toEqual(['activityLog', 'isAuthenticated', 'token', 'user'])
  })
})
