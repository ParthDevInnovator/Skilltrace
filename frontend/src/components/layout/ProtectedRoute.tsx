import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isPendingUser, useAuth } from '@/context/AuthContext'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { PendingApprovalPage } from '@/pages/PendingApprovalPage'

export function ProtectedRoute({ children, requiredRole }: { children: ReactNode; requiredRole?: string }) {
  const auth = useAuth()
  const location = useLocation()
  if (!auth.ready) return <main aria-busy="true"><p>Loading secure workspace…</p></main>
  if (!auth.isAuthenticated) return <Navigate replace to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />
  // Pending accounts have no data access, so the workspace (and its API calls) never mounts.
  if (isPendingUser(auth.user)) return <PendingApprovalPage />
  if (requiredRole && !auth.hasRole(requiredRole)) return <ForbiddenPage />
  return children
}
