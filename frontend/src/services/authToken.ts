type TokenProvider = () => Promise<string | null>
let tokenProvider: TokenProvider = async () => null

export function setTokenProvider(provider: TokenProvider) {
  tokenProvider = provider
  return () => { tokenProvider = async () => null }
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenProvider()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
