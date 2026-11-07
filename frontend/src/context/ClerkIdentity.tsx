import { useAuth as useClerkAuth, useUser } from '@clerk/react'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { AuthContext, type AuthUser } from './AuthContext'
import { setTokenProvider } from '@/services/authToken'

export function ClerkIdentity({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionId, userId, getToken, signOut } = useClerkAuth()
  const { isLoaded: profileLoaded, user: clerkUser } = useUser()
  const [identity, setIdentity] = useState<{ session: string | null | undefined; user: AuthUser | null } | null>(null)
  useLayoutEffect(() => setTokenProvider(getToken), [getToken])
  useEffect(() => {
    if (!isLoaded) return
    let live = true
    void (async () => {
      try {
        const token = await getToken()
        if (!token) { if (live) setIdentity({ session: sessionId, user: null }); return }
        const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error('Identity unavailable')
        const user = await response.json()
        if (!user?.user_id || !Array.isArray(user.roles)) throw new Error('Invalid identity')
        if (live) setIdentity({ session: sessionId, user })
      } catch { if (live) setIdentity({ session: sessionId, user: null }) }
    })()
    return () => { live = false }
  }, [isLoaded, sessionId, getToken])
  const serverUser = identity?.session === sessionId ? identity?.user ?? null : null
  const profile = isSignedIn && clerkUser?.id === userId ? clerkUser : null
  const user = serverUser && profile ? {
    ...serverUser,
    full_name: profile.fullName?.trim() || profile.username || profile.primaryEmailAddress?.emailAddress || 'Signed-in user',
    email: profile.primaryEmailAddress?.emailAddress || serverUser.email,
    image_url: profile.hasImage ? profile.imageUrl : undefined,
  } : serverUser
  return <AuthContext.Provider value={{ user, accessToken: null,
    error: isSignedIn && identity?.session === sessionId && !user ? 'Your sign-in could not be verified by the server. Contact your administrator or sign out and retry.' : undefined,
    ready: Boolean(isLoaded && profileLoaded && identity?.session === sessionId), isAuthenticated: Boolean(isSignedIn && user),
    hasRole: role => Boolean(user?.roles.includes('hr_admin') || user?.roles.includes(role)),
    login: async () => { throw new Error('Use Clerk sign in') },
    logout: async () => { setIdentity(null); await signOut() },
    refreshToken: async () => { await getToken({ skipCache: true }) },
  }}>{children}</AuthContext.Provider>
}
