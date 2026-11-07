import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { setTokenProvider } from '@/services/authToken'

export type AuthUser = {
  user_id: string
  email: string
  full_name: string
  image_url?: string
  roles: string[]
}

type AuthValue = {
  user: AuthUser | null
  accessToken: string | null
  login: (email: string, password?: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
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

  useLayoutEffect(() => {
    return setTokenProvider(async () => accessToken)
  }, [accessToken])

  const clear = useCallback(() => {
    sessionStorage.removeItem(ACCESS)
    sessionStorage.removeItem(REFRESH)
    setAccessToken(null)
    setUser(null)
  }, [])

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
    fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(json).then(data => {
        if (!data?.user_id || !Array.isArray(data.roles)) throw new Error('Invalid identity')
        if (!cancelled) { setUser(data); setAccessToken(token) }
      }).catch(() => { if (!cancelled) clear() })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [testMode, clear])

  const refreshToken = useCallback(async () => {
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
      sessionStorage.setItem(ACCESS, data.access_token)
      setAccessToken(data.access_token)
      await loadMe(data.access_token)
    } catch {
      clear()
    }
  }, [clear, loadMe])

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
        setAccessToken(data.access_token)
        await loadMe(data.access_token)
      } catch (error) {
        clear()
        throw error
      }
    },
    [loadMe, clear]
  )

  const logout = useCallback(async () => {
    try {
      if (accessToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      }
    } finally {
      clear()
    }
  }, [accessToken, clear])

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
      isAuthenticated: Boolean(user && accessToken),
      hasRole,
      ready,
    }),
    [user, accessToken, login, logout, refreshToken, hasRole, ready]
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
      isAuthenticated: true,
      hasRole: (role: string) => role === 'recruiter',
      ready: true,
    }
  }
  throw new Error('useAuth must be used within AuthProvider')
}
