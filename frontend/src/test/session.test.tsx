import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'

const ACCESS = 'mosaic.access_token'
const REFRESH = 'mosaic.refresh_token'
const me = { user_id: 'u1', email: 'r@example.com', full_name: 'Rae', roles: ['recruiter'] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Auth = ReturnType<typeof useAuth>
const probe = {} as { auth: Auth }
function Probe() { const value = useAuth(); useEffect(() => { probe.auth = value }); return null }
const mount = () => render(<AuthProvider><Probe /></AuthProvider>)
const calls = (path: string) => vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === path)
const bearer = (init?: RequestInit) => new Headers(init?.headers).get('Authorization')

describe('native session handling (OI-06/OI-07)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    sessionStorage.setItem('mosaic.test_unauthenticated', 'true') // exercise the real provider
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear() })

  async function signedIn() {
    sessionStorage.setItem(ACCESS, 'access-1')
    sessionStorage.setItem(REFRESH, 'refresh-1')
    vi.mocked(fetch).mockResolvedValueOnce(json(me))
    mount()
    await waitFor(() => expect(probe.auth.isAuthenticated).toBe(true))
  }

  it('empties storage in the same tick logout() is called, before the server answers', async () => {
    await signedIn()
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {})) // server never answers
    act(() => { void probe.auth.logout() })
    expect(sessionStorage.getItem(ACCESS)).toBeNull()
    expect(sessionStorage.getItem(REFRESH)).toBeNull()
    expect(probe.auth.isAuthenticated).toBe(false)
  })

  it('revokes with keepalive and sends the refresh token in the body', async () => {
    await signedIn()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await act(() => probe.auth.logout())
    const [, init] = calls('/api/v1/auth/logout')[0]
    expect(init?.keepalive).toBe(true)
    expect(bearer(init)).toBe('Bearer access-1')
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'refresh-1' })
  })

  it('signs out locally while offline', async () => {
    await signedIn()
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(() => probe.auth.logout())
    expect(sessionStorage.getItem(ACCESS)).toBeNull()
    expect(probe.auth.isAuthenticated).toBe(false)
  })

  it('renews an expired access token on load and stores the rotated refresh token', async () => {
    sessionStorage.setItem(ACCESS, 'expired')
    sessionStorage.setItem(REFRESH, 'refresh-1')
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ detail: 'expired' }, 401))
      .mockResolvedValueOnce(json({ access_token: 'access-2', refresh_token: 'refresh-2' }))
      .mockResolvedValueOnce(json(me))
    mount()
    await waitFor(() => expect(probe.auth.isAuthenticated).toBe(true))
    expect(sessionStorage.getItem(ACCESS)).toBe('access-2')
    expect(sessionStorage.getItem(REFRESH)).toBe('refresh-2')
    expect(JSON.parse(String(calls('/api/v1/auth/refresh')[0][1]?.body))).toEqual({ refresh_token: 'refresh-1' })
  })

  it('shares one refresh between concurrent 401s and retries with the new token', async () => {
    await signedIn()
    let releaseRefresh!: () => void
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (url === '/api/v1/auth/refresh') {
        await new Promise<void>(resolve => { releaseRefresh = resolve })
        return json({ access_token: 'access-2', refresh_token: 'refresh-2' })
      }
      return bearer(init) === 'Bearer access-2' ? json([]) : json({ detail: 'expired' }, 401)
    })
    const pending = Promise.all([api.getJobs(), api.getJobById('J1'), api.getCandidates()])
    await waitFor(() => expect(calls('/api/v1/auth/refresh')).toHaveLength(1))
    releaseRefresh()
    await expect(pending).resolves.toHaveLength(3)
    expect(calls('/api/v1/auth/refresh')).toHaveLength(1) // a second rotation would revoke the family
    expect(sessionStorage.getItem(REFRESH)).toBe('refresh-2')
  })

  it('clears the session when the refresh token is rejected', async () => {
    await signedIn()
    vi.mocked(fetch).mockImplementation(async url =>
      url === '/api/v1/auth/refresh' ? json({ detail: 'revoked' }, 401) : json({ detail: 'expired' }, 401))
    await expect(api.getJobs()).rejects.toThrow(/401/)
    await waitFor(() => expect(probe.auth.isAuthenticated).toBe(false))
    expect(sessionStorage.getItem(REFRESH)).toBeNull()
  })
})
