import { useAuth as useClerkAuth, useUser } from '@clerk/react'
import { useEffect, type ReactNode } from 'react'
import { setTokenProvider } from '@/services/authToken'

export function AuthProvider({children}:{children:ReactNode}) {
  const { getToken } = useClerkAuth()
  useEffect(() => setTokenProvider(getToken), [getToken])
  return children
}

export function useAuth() {
  const auth = useClerkAuth()
  const { user, isLoaded } = useUser()
  const metadata = user?.publicMetadata as { role?:string; roles?:string[] } | undefined
  const roles = metadata?.roles ?? (metadata?.role ? [metadata.role] : ['recruiter'])
  return {
    user: user ? { user_id:user.id, email:user.primaryEmailAddress?.emailAddress ?? '', full_name:user.fullName ?? user.username ?? 'Clerk user', roles } : null,
    isAuthenticated: Boolean(auth.isSignedIn),
    ready: Boolean(auth.isLoaded && isLoaded),
    hasRole: (role:string) => roles.includes('hr_admin') || roles.includes(role),
  }
}
