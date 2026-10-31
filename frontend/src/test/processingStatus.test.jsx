import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProcessingStatus from '../components/upload/ProcessingStatus'
import { api } from '../api/client'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

afterEach(() => vi.restoreAllMocks())

describe('ProcessingStatus', () => {
  it('stops polling at partial failure and offers a flashcard-only retry', async () => {
    vi.spyOn(api, 'getLectureStatus').mockResolvedValueOnce({ data: {
      status: 'FAILED', progress_step: 5, progress_percent: 95,
      error_message: '[GEMINI:quota_exhausted] Gemini API quota has been exhausted.',
      flashcards_retryable: true,
    } }).mockResolvedValue({ data: { status: 'PENDING', progress_step: 5, progress_percent: 95 } })
    const retry = vi.spyOn(api, 'retryFlashcards').mockResolvedValue({ data: {} })
    render(<MemoryRouter><ProcessingStatus lectureId="lec-1" /></MemoryRouter>)
    expect(await screen.findByText(/lecture content and saved flashcards are preserved/i)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Retry flashcard generation' }))
    expect(retry).toHaveBeenCalledWith('lec-1')
    expect(await screen.findByText(/Generating flashcards/)).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '95')
  })
})
