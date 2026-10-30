import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthCallback } from '../App'
import useStore from '../store/useStore'

function mount(search = '', hash = '') {
  window.history.replaceState(null, '', `/auth/success${search}${hash}`)
  return render(
    <MemoryRouter initialEntries={[`/auth/success${search}`]}>
      <Routes>
        <Route path="/auth/success" element={<AuthCallback />} />
        <Route path="/dashboard" element={<div>dashboard page</div>} />
        <Route path="/" element={<div>landing page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  useStore.setState({ user: null, token: null, isAuthenticated: false })
  vi.unstubAllGlobals()
})

describe('Google sign-in callback', () => {
  it('reads the token from the fragment, signs in and scrubs the address bar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'u1', email: 'a@b.c' }) }))
    mount('', '#token=jwt-123')
    expect(await screen.findByText('dashboard page')).toBeInTheDocument()
    expect(useStore.getState()).toMatchObject({ isAuthenticated: true, token: 'jwt-123' })
    expect(window.location.hash).toBe('')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt-123')
  })

  it('does not sign in when the server rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    mount('', '#token=bad')
    expect(await screen.findByText('landing page')).toBeInTheDocument()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('goes back to the landing page without signing in when the API reports an error', async () => {
    vi.stubGlobal('fetch', vi.fn())
    mount('?error=account_deactivated')
    expect(await screen.findByText('landing page')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('ignores a token passed in the query string', async () => {
    vi.stubGlobal('fetch', vi.fn())
    mount('?token=sneaky')
    await waitFor(() => expect(screen.getByText('landing page')).toBeInTheDocument())
    expect(useStore.getState().isAuthenticated).toBe(false)
  })
})
