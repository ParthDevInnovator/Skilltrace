import { useCallback, useEffect, useRef, useState } from 'react'

export type PolledPhase = 'loading' | 'pending' | 'ready' | 'error' | 'exhausted'
export interface PolledEntry<T> { value: T | null; phase: PolledPhase }

interface Options { interval?: number; limit?: number }
interface Run { scope: string; cancel: () => void }

const LOADING: PolledEntry<never> = { value: null, phase: 'loading' }

/**
 * Fetch one resource per ID and keep polling each ID while `isPending` says it is still
 * building. Every ID has its own state, so one failure never hides another ID's result, and
 * `retry(id)` restarts just that ID (OI-14, OI-15). Changing `scope` (e.g. the job) refetches all.
 * A pending ID stops after `limit` calls with phase `exhausted`.
 */
export function usePolledPerId<T>(ids: string[], scope: string, fetcher: (id: string) => Promise<T>, isPending: (value: T) => boolean, enabled = true, { interval = 3000, limit = 10 }: Options = {}) {
  const [entries, setEntries] = useState<Record<string, PolledEntry<T> & { scope: string }>>({})
  const runs = useRef(new Map<string, Run>())
  const fns = useRef({ fetcher, isPending })
  useEffect(() => { fns.current = { fetcher, isPending } })

  const start = useCallback((id: string) => {
    runs.current.get(id)?.cancel()
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined, calls = 0
    const put = (entry: PolledEntry<T>) => setEntries(previous => ({ ...previous, [id]: { ...entry, scope } }))
    const run = async () => {
      try {
        const value = await fns.current.fetcher(id)
        if (cancelled) return
        calls++
        const phase: PolledPhase = !fns.current.isPending(value) ? 'ready' : calls >= limit ? 'exhausted' : 'pending'
        put({ value, phase })
        if (phase === 'pending') timer = setTimeout(() => { void run() }, interval)
      } catch {
        if (!cancelled) put({ value: null, phase: 'error' })
      }
    }
    put(LOADING)
    runs.current.set(id, { scope, cancel: () => { cancelled = true; clearTimeout(timer) } })
    void run()
  }, [scope, interval, limit])

  const idKey = ids.join('\n')
  useEffect(() => {
    if (!enabled) return
    const wanted = idKey ? idKey.split('\n') : []
    for (const id of wanted) if (runs.current.get(id)?.scope !== scope) start(id)
    for (const [id, run] of runs.current) if (!wanted.includes(id)) { run.cancel(); runs.current.delete(id) }
  }, [idKey, scope, enabled, start])

  useEffect(() => {
    const active = runs.current
    return () => { for (const run of active.values()) run.cancel(); active.clear() }
  }, [])

  const get = (id: string): PolledEntry<T> => {
    const entry = entries[id]
    return entry && entry.scope === scope ? entry : LOADING
  }
  return { get, retry: start }
}
