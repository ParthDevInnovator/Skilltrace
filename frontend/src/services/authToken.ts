type TokenProvider = () => Promise<string | null>
/** Obtains a fresh access token after a 401, or null when the session cannot be renewed. */
type SessionRenewer = () => Promise<string | null>

let tokenProvider: TokenProvider = async () => null
let sessionRenewer: SessionRenewer = async () => null

export function setTokenProvider(provider: TokenProvider) {
  tokenProvider = provider
  return () => { tokenProvider = async () => null }
}

export function setSessionRenewer(renewer: SessionRenewer) {
  sessionRenewer = renewer
  return () => { sessionRenewer = async () => null }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenProvider()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function withToken(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  else headers.delete('Authorization')
  return { ...init, headers }
}

/**
 * fetch with the current access token. A 401 renews the session once and retries;
 * if renewal fails the original 401 is returned and the session has been cleared.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const used = await tokenProvider()
  const response = await fetch(input, withToken(init, used))
  if (response.status !== 401) return response
  // Another request may already have renewed the session while this one was in flight.
  const current = await tokenProvider()
  const renewed = current && current !== used ? current : await sessionRenewer()
  if (!renewed) return response
  return fetch(input, withToken(init, renewed))
}
