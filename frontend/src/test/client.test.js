import { describe, it, expect, beforeEach } from 'vitest'
import client, { errorMessage } from '../api/client'
import useStore from '../store/useStore'

function failWith(status, data) {
  client.defaults.adapter = (config) =>
    Promise.reject(Object.assign(new Error('fail'), { config, response: { status, data, config } }))
}

beforeEach(() => useStore.getState().setAuth({ id: 'u1' }, 'tok'))

describe('401 handling', () => {
  it('signs the user out through the store, without a hard reload', async () => {
    failWith(401, { detail: 'Session is no longer valid' })
    await expect(client.get('/lectures')).rejects.toBeTruthy()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('has no side effects for a failed login attempt (no token sent)', async () => {
    useStore.setState({ token: null, isAuthenticated: false, user: null })
    failWith(401, { detail: 'Incorrect email or password' })
    await expect(client.post('/auth/login', {})).rejects.toBeTruthy()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('keeps the session on other errors', async () => {
    failWith(500, { detail: 'boom' })
    await expect(client.get('/lectures')).rejects.toBeTruthy()
    expect(useStore.getState().isAuthenticated).toBe(true)
  })

  it('attaches the bearer token', async () => {
    let seen
    client.defaults.adapter = (config) => {
      seen = config.headers.Authorization
      return Promise.resolve({ data: {}, status: 200, config, headers: {} })
    }
    await client.get('/lectures')
    expect(seen).toBe('Bearer tok')
  })
})

describe('errorMessage', () => {
  it('explains network failures and timeouts', () => {
    expect(errorMessage({})).toMatch(/cannot reach the server/i)
    expect(errorMessage({ code: 'ECONNABORTED' })).toMatch(/timed out/i)
  })
  it('uses the API detail and adds a reference for server errors', () => {
    expect(errorMessage({ response: { status: 409, data: { detail: 'Already exists' } } })).toBe('Already exists')
    expect(errorMessage({ response: { status: 500, data: { detail: 'Oops', request_id: 'abcdef1234' } } })).toContain('ref abcdef12')
  })
  it('asks the user to wait when rate limited', () => {
    expect(errorMessage({ response: { status: 429, data: { detail: 'Too many requests.' } } })).toMatch(/wait/i)
  })
})
