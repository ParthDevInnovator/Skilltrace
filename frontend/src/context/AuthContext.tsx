import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setSessionRenewer, setTokenProvider } from '@/services/authToken'

export type AuthUser = {
  user_id: string
  email: string
  full_name: string
  image_url?: string
  roles: string[]
  /** `pending` until domain auto-admission or HR-admin approval (OI-05). */
  status?: 'pending' | 'active'
  email_verified?: boolean
  workspace?: { id: string; name: string } | null
}

const ACCESS_ROLES = ['recruiter', 'hiring_manager', 'hr_admin']

/** A signed-in user without workspace admission: no data access until approved. */
// oxlint-disable-next-line react/only-export-components
export function isPendingUser(user: AuthUser | null | undefined) {
  if (!user) return false
  return user.status === 'pending' || !user.roles.some(role => ACCESS_ROLES.includes(role))
}

type AuthValue = {
  user: AuthUser | null
  accessToken: string | null
  login: (email: string, password?: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  /** Re-reads `/auth/me`, e.g. to see whether a pending account has been approved. */
  reloadIdentity: () => Promise<void>
  isAuthenticated: boolean
  hasRole: (role: string) => boolean
  ready: boolean
  error?: string
}

// oxlint-disable-next-line react/only-export-components
export const AuthContext = createContext<AuthValue | null>(null)
const ACCESS = 'mosaic.access_token'
const REFRESH = 'mosaic.refresh_token'

const defaultUser: AuthUser = {
  user_id: 'USR-84920',
  email: 'elena.marsh@skitrace.com',
  full_name: 'Elena Marsh',
  roles: ['recruiter'],
}

async function json(response: Response) {
  if (!response.ok) {
    const error = new Error(`Authentication failed (${response.status})`)
    Object.assign(error, { status: response.status })
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTest = import.meta.env.MODE === 'test'
  const isExplicitlyUnauth = sessionStorage.getItem('mosaic.test_unauthenticated') === 'true'
  const testMode = isTest && !isExplicitlyUnauth

  const [accessToken, setAccessToken] = useState<string | null>(() => {
    if (testMode) return 'test-token'
    if (isExplicitlyUnauth) return null
    return null
  })

  const [user, setUser] = useState<AuthUser | null>(() => {
    if (testMode) return defaultUser
    if (isExplicitlyUnauth) return null
    return null
  })

  const [ready, setReady] = useState<boolean>(testMode)
  // Read synchronously by API calls, so a renewed token is used before React re-renders.
  const tokenRef = useRef<string | null>(accessToken)
  const renewal = useRef<Promise<string | null> | null>(null)

  const applyToken = useCallback((token: string | null) => {
    tokenRef.current = token
    setAccessToken(token)
  }, [])

  useLayoutEffect(() => setTokenProvider(async () => tokenRef.current), [])

  const clear = useCallback(() => {
    sessionStorage.removeItem(ACCESS)
    sessionStorage.removeItem(REFRESH)
    renewal.current = null
    applyToken(null)
    setUser(null)
  }, [applyToken])

  /**
   * Exchanges the refresh token for a new pair. The server rotates refresh tokens and revokes
   * the whole session if one is reused, so concurrent callers share a single request.
   */
  const renewSession = useCallback((): Promise<string | null> => {
    if (renewal.current) return renewal.current
    const attempt = (async () => {
      try {
        const refresh = sessionStorage.getItem(REFRESH)
        if (!refresh) throw new Error('No refresh token')
        const data = await json(
          await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refresh }),
          })
        )
        if (!data?.access_token || !data?.refresh_token) throw new Error('Invalid refresh response')
        sessionStorage.setItem(ACCESS, data.access_token)
        sessionStorage.setItem(REFRESH, data.refresh_token)
        applyToken(data.access_token)
        return data.access_token as string
      } catch {
        clear()
        return null
      }
    })().finally(() => {
      if (renewal.current === attempt) renewal.current = null
    })
    renewal.current = attempt
    return attempt
  }, [applyToken, clear])

  useLayoutEffect(() => (testMode ? undefined : setSessionRenewer(renewSession)), [testMode, renewSession])

  const loadMe = useCallback(async (token: string) => {
    const data = await json(await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }))
    if (!data?.user_id || !Array.isArray(data.roles)) throw new Error('Invalid server identity')
    setUser(data)
    return data as AuthUser
  }, [])

  useEffect(() => {
    if (testMode) return
    let cancelled = false
    const token = sessionStorage.getItem(ACCESS)
    if (!token) { void Promise.resolve().then(() => { if (!cancelled) setReady(true) }); return () => { cancelled = true } }
    const identify = async (access: string) => {
      const data = await json(await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${access}` } }))
      if (!data?.user_id || !Array.isArray(data.roles)) throw new Error('Invalid identity')
      return data as AuthUser
    }
    void (async () => {
      try {
        let access: string | null = token
        let data: AuthUser
        try {
          data = await identify(access)
        } catch (error) {
          // An access token that expired while the tab was closed is renewed once.
          if ((error as { status?: number }).status !== 401) throw error
          access = await renewSession()
          if (!access) throw error
          data = await identify(access)
        }
        if (!cancelled) { setUser(data); applyToken(access) }
      } catch {
        if (!cancelled) clear()
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [testMode, clear, renewSession, applyToken])

  const refreshToken = useCallback(async () => {
    const access = await renewSession()
    if (!access) return
    try { await loadMe(access) } catch { clear() }
  }, [renewSession, loadMe, clear])

  const reloadIdentity = useCallback(async () => {
    const access = tokenRef.current
    if (!access) return
    try {
      await loadMe(access)
    } catch (error) {
      if ((error as { status?: number }).status === 401) await refreshToken()
      else throw error
    }
  }, [loadMe, refreshToken])

  const login = useCallback(
    async (email: string, password?: string) => {
      clear()
      try {
        const data = await json(
          await fetch('/api/v1/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
        )
        sessionStorage.setItem(ACCESS, data.access_token)
        if (data.refresh_token) sessionStorage.setItem(REFRESH, data.refresh_token)
        applyToken(data.access_token)
        await loadMe(data.access_token)
      } catch (error) {
        clear()
        throw error
      }
    },
    [loadMe, clear, applyToken]
  )

  const logout = useCallback(async () => {
    // Clear local credentials first, in the same tick, so an immediate reload cannot restore
    // the session (OI-07). The server revocation is best-effort and survives page unload.
    const access = tokenRef.current ?? sessionStorage.getItem(ACCESS)
    const refresh = sessionStorage.getItem(REFRESH)
    clear()
    if (!access && !refresh) return
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
        body: JSON.stringify({ refresh_token: refresh }),
      })
    } catch {
      // Offline or unloading: the server session expires on its own; local state is already gone.
    }
  }, [clear])

  const hasRole = useCallback(
    (role: string) => Boolean(user?.roles.includes('hr_admin') || user?.roles.includes(role)),
    [user]
  )

  const value = useMemo(
    () => ({
      user,
      accessToken,
      login,
      logout,
      refreshToken,
      reloadIdentity,
      isAuthenticated: Boolean(user && accessToken),
      hasRole,
      ready,
    }),
    [user, accessToken, login, logout, refreshToken, reloadIdentity, hasRole, ready]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (value) return value
  if (import.meta.env.MODE === 'test') {
    return {
      user: defaultUser,
      accessToken: 'test-token',
      login: async () => {},
      logout: async () => {},
      refreshToken: async () => {},
      reloadIdentity: async () => {},
      isAuthenticated: true,
      hasRole: (role: string) => role === 'recruiter',
      ready: true,
    }
  }
  throw new Error('useAuth must be used within AuthProvider')
}
