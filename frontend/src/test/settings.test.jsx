import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '../pages/Settings'
import useStore from '../store/useStore'
import { api } from '../api/client'

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

function mount(user) {
  useStore.getState().setAuth(user, 'tok')
  return render(<MemoryRouter><Settings /></MemoryRouter>)
}

beforeEach(() => vi.restoreAllMocks())

describe('Settings page', () => {
  it('keeps delete disabled until DELETE and the password are provided', async () => {
    mount({ id: 'u', email: 'a@b.c', has_password: true })
    const button = screen.getByRole('button', { name: 'Delete my account' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/type/i), 'DELETE')
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Current password'), 'pw')
    expect(button).toBeEnabled()
  })

  it('does not ask for a password on Google-only accounts', () => {
    mount({ id: 'u', email: 'a@b.c', has_password: false })
    expect(screen.queryByLabelText('Current password')).toBeNull()
  })

  it('deletes the account, signs out locally and shows API errors without signing out', async () => {
    const spy = vi.spyOn(api, 'deleteAccount').mockRejectedValueOnce({ response: { status: 403, data: { detail: 'Incorrect password' } } })
    mount({ id: 'u', email: 'a@b.c', has_password: true })
    await userEvent.type(screen.getByLabelText(/type/i), 'DELETE')
    await userEvent.type(screen.getByLabelText('Current password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password')
    expect(useStore.getState().isAuthenticated).toBe(true)

    spy.mockResolvedValueOnce({ data: {} })
    await userEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(useStore.getState().isAuthenticated).toBe(false))
    expect(spy).toHaveBeenLastCalledWith('wrong')
  })
})
