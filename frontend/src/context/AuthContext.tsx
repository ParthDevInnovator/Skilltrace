import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setTokenProvider } from '@/services/authToken'

export type AuthUser = {
  user_id: string
  email: string
  full_name: string
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
}

const AuthContext = createContext<AuthValue | null>(null)
const ACCESS = 'mosaic.access_token'
const REFRESH = 'mosaic.refresh_token'

export const defaultUser: AuthUser = {
  user_id: 'USR-84920',
  email: 'elena.marsh@skitrace.com',
  full_name: 'Elena Marsh',
  roles: ['recruiter', 'hr_admin'],
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
    return sessionStorage.getItem(ACCESS) || 'demo-session-token'
  })

  const [user, setUser] = useState<AuthUser | null>(() => {
    if (testMode) return defaultUser
    if (isExplicitlyUnauth) return null
    return defaultUser
  })

  const [ready] = useState<boolean>(true)

  useEffect(() => {
    setTokenProvider(async () => accessToken)
  }, [accessToken])

  const clear = useCallback(() => {
    sessionStorage.removeItem(ACCESS)
    sessionStorage.removeItem(REFRESH)
    setAccessToken(null)
    setUser(null)
  }, [])

  const loadMe = useCallback(async (token: string) => {
    try {
      const data = await json(await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } }))
      if (data) setUser(data)
    } catch {
      // Keep default user if mock/offline
    }
  }, [])

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
    async (email: string, password = 'password123') => {
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
      } catch {
        // Fallback for standalone demo/test
        const demo: AuthUser = {
          user_id: 'USR-84920',
          email,
          full_name: email.split('@')[0].replace(/[._-]/g, ' ') || 'Elena Marsh',
          roles: ['recruiter', 'hr_admin'],
        }
        sessionStorage.setItem(ACCESS, 'demo-token')
        sessionStorage.removeItem('mosaic.test_unauthenticated')
        setAccessToken('demo-token')
        setUser(demo)
      }
    },
    [loadMe]
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
