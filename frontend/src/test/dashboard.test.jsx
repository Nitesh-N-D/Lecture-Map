import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
import useStore from '../store/useStore'
import { api } from '../api/client'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const LECTURE = { id: 'L1', title: 'Thermodynamics', status: 'COMPLETED', flashcard_count: 4, created_at: '2026-10-30T10:00:00Z' }
const PROGRESS = {
  total_concepts: 10, completed_concepts: 4, mastered_concepts: 2, pending_concepts: 6, blocked_concepts: 3,
  percent: 40, current_lecture_id: 'L1',
  lectures: [{ lecture_id: 'L1', title: 'Thermodynamics', concepts: 10, completed: 4, mastered: 2, percent: 40 }],
}

function mount() {
  useStore.getState().setAuth({ id: 'u1', email: 'a@b.c' }, 'tok')
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
  useStore.setState({ lectures: [] })
  vi.spyOn(api, 'getLectures').mockResolvedValue({ data: [LECTURE] })
  vi.spyOn(api, 'getReviewStats').mockResolvedValue({ data: { cards_due_today: 3, cards_reviewed_today: 1, streak_days: 2, total_cards: 4 } })
  vi.spyOn(api, 'getReviewHistory').mockResolvedValue({ data: { days: {}, total_reviews: 0, recent: [] } })
})

describe('Dashboard learning progress', () => {
  it('shows real concept totals from the server and a continue link', async () => {
    vi.spyOn(api, 'getProgressSummary').mockResolvedValue({ data: PROGRESS })
    mount()
    const section = await screen.findByRole('region', { name: 'Learning progress' })
    expect(section).toHaveTextContent('4 of 10 concepts studied or mastered (40%)')
    expect(section).toHaveTextContent('Mastered2')
    expect(section).toHaveTextContent('Pending6')
    expect(screen.getByRole('link', { name: /Continue Thermodynamics/ })).toHaveAttribute('href', '/lectures/L1')
    expect(await screen.findByText('4 / 10 learned')).toBeInTheDocument()
  })

  it('reports a progress failure with a working retry instead of showing zeros', async () => {
    const summary = vi.spyOn(api, 'getProgressSummary')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ data: PROGRESS })
    mount()
    expect(await screen.findByText('Could not load your learning progress.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('region', { name: 'Learning progress' })).toBeInTheDocument()
    expect(summary).toHaveBeenCalledTimes(2)
  })

  it('hides the progress panel until a lecture has concepts', async () => {
    vi.spyOn(api, 'getProgressSummary').mockResolvedValue({ data: { ...PROGRESS, total_concepts: 0, lectures: [] } })
    mount()
    await screen.findByText('Thermodynamics')
    expect(screen.queryByRole('region', { name: 'Learning progress' })).toBeNull()
  })
})
