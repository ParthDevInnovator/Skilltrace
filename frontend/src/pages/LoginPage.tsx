import { SignIn } from '@clerk/react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const auth = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  if (auth.ready && auth.isAuthenticated) return <Navigate replace to={next}/>
  return <main className="login-page"><SignIn routing="hash" fallbackRedirectUrl={next}/></main>
}
