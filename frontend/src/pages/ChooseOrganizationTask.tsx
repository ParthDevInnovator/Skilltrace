import { TaskChooseOrganization, useClerk } from '@clerk/react'
import { useCallback, useSyncExternalStore } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export const CHOOSE_ORGANIZATION_PATH = '/session-tasks/choose-organization'

function destination(requested: string | null) {
  return requested && /^\/(dashboard|candidates)(\/|\?|$)/.test(requested) && !requested.includes('\\') ? requested : '/dashboard'
}

/** Pending Clerk session task key, or null when the session is active or absent. */
// oxlint-disable-next-line react/only-export-components
export function usePendingSessionTask(): string | null {
  const clerk = useClerk()
  const subscribe = useCallback((onChange: () => void) => clerk.addListener(onChange), [clerk])
  return useSyncExternalStore(subscribe, () => {
    const session = clerk.session
    return session?.status === 'pending' ? session.currentTask?.key ?? null : null
  })
}

// Clerk keeps a session "pending" (treated as signed out) until the user picks or
// creates an organization. This page renders Clerk's picker for that task.
export function ChooseOrganizationTaskPage() {
  const auth = useAuth()
  const task = usePendingSessionTask()
  const [params] = useSearchParams()
  const next = destination(params.get('next'))
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) return <Navigate replace to="/login" />
  if (auth.ready && auth.isAuthenticated) return <Navigate replace to={next} />
  return (
    <main className="login-page">
      <h1 className="sr-only">Choose your organization</h1>
      {task === 'choose-organization' || task === null
        ? <TaskChooseOrganization redirectUrlComplete={next} />
        : <p role="alert">Your account needs an additional sign-in step ({task}). Contact your administrator.</p>}
    </main>
  )
}
