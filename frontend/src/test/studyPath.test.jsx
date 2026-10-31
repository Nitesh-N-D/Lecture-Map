import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import StudyPath from '../pages/StudyPath'
import useStore from '../store/useStore'
import { api } from '../api/client'
import { buildSteps, loadSession, saveSession, storageKey } from '../lib/studyPath'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const node = (concept_id, extra = {}) => ({
  concept_id, name: concept_id.toUpperCase(), definition: `about ${concept_id}`,
  difficulty: 'intermediate', status: 'unexplored', is_visited: false, ...extra,
})
const GRAPH = { nodes: [node('a', { difficulty: 'beginner' }), node('b'), node('c', { difficulty: 'advanced' })], edges: [] }
const PATH = { path: [node('a'), node('b')], target: node('c'), target_concept_id: 'c', total_steps: 2 }

function mount(url = '/lectures/L1/study') {
  useStore.getState().setAuth({ id: 'u1', email: 'a@b.c' }, 'tok')
  useStore.getState().setVisitedNodes([])
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/lectures/:id/study" element={<StudyPath />} /></Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  vi.spyOn(api, 'getGraph').mockResolvedValue({ data: GRAPH })
  vi.spyOn(api, 'getStudyPath').mockResolvedValue({ data: PATH })
})

describe('study path helpers', () => {
  it('orders prerequisites before the target and picks the first unfinished step', () => {
    const { steps, current, done } = buildSteps(PATH, new Set(['a']), [])
    expect(steps.map((s) => s.concept_id)).toEqual(['a', 'b', 'c'])
    expect(steps[2].isTarget).toBe(true)
    expect(current).toBe(1)
    expect(done).toBe(1)
  })

  it('moves past skipped steps but comes back to them before finishing', () => {
    expect(buildSteps(PATH, new Set(), ['a']).current).toBe(1)
    expect(buildSteps(PATH, new Set(['b', 'c']), ['a']).current).toBe(0)
    expect(buildSteps(PATH, new Set(['a', 'b', 'c']), []).current).toBe(-1)
  })

  it('treats mastered concepts as finished', () => {
    const mastered = { ...PATH, path: [node('a', { status: 'mastered' }), node('b')] }
    expect(buildSteps(mastered, new Set(), []).steps[0].finished).toBe(true)
  })

  it('persists sessions per account and lecture and tolerates corrupt data', () => {
    saveSession('u1', 'L1', { target: 'c', skipped: ['a'], paused: true })
    expect(loadSession('u1', 'L1')).toEqual({ target: 'c', skipped: ['a'], paused: true })
    expect(loadSession('u2', 'L1').target).toBe('')
    window.localStorage.setItem(storageKey('u1', 'L2'), '{not json')
    expect(loadSession('u1', 'L2').target).toBe('')
  })

  it('clears saved paths on logout', () => {
    saveSession('u1', 'L1', { target: 'c', skipped: [], paused: false })
    useStore.getState().logout()
    expect(window.localStorage.getItem(storageKey('u1', 'L1'))).toBeNull()
  })
})

describe('Study Path page', () => {
  it('starts a path, completes a step on the server and advances', async () => {
    const visit = vi.spyOn(api, 'markVisited').mockResolvedValue({ data: {} })
    mount()
    await userEvent.selectOptions(await screen.findByLabelText('Target concept'), 'c')
    await userEvent.click(screen.getByRole('button', { name: 'Start path' }))

    const currentStep = await screen.findByLabelText('Current step')
    expect(currentStep).toHaveTextContent('A')
    await userEvent.click(screen.getByRole('button', { name: /Complete & next/ }))
    expect(visit).toHaveBeenCalledWith('a', 'L1')
    await waitFor(() => expect(screen.getByLabelText('Current step')).toHaveTextContent('B'))
    expect(screen.getByText(/1 of 3 steps complete/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem(storageKey('u1', 'L1'))).target).toBe('c')
  })

  it('restores the saved path after a refresh, including skips and pause', async () => {
    saveSession('u1', 'L1', { target: 'c', skipped: ['a'], paused: false })
    mount()
    expect(await screen.findByLabelText('Current step')).toHaveTextContent('B')
    expect(api.getStudyPath).toHaveBeenCalledWith('L1', 'c')

    await userEvent.click(screen.getByRole('button', { name: /Pause/ }))
    expect(screen.queryByLabelText('Current step')).toBeNull()
    expect(loadSession('u1', 'L1').paused).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /Resume/ }))
    expect(screen.getByLabelText('Current step')).toBeInTheDocument()
  })

  it('shows the completed state when every step is done and allows undo', async () => {
    const unvisit = vi.spyOn(api, 'unmarkVisited').mockResolvedValue({ data: {} })
    api.getGraph.mockResolvedValue({ data: { ...GRAPH, nodes: GRAPH.nodes.map((n) => ({ ...n, is_visited: true })) } })
    mount('/lectures/L1/study?target=c')
    expect(await screen.findByText('Path complete.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo B' }))
    expect(unvisit).toHaveBeenCalledWith('b', 'L1')
    expect(await screen.findByLabelText('Current step')).toHaveTextContent('B')
  })

  it('shows a retryable error when the graph cannot load', async () => {
    api.getGraph.mockRejectedValueOnce(new Error('down'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load/)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('Target concept')).toBeInTheDocument()
  })
})
