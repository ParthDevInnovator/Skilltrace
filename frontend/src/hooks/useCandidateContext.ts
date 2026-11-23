import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '@/services/api'
import type { BuildStage, CandidateContext } from '@/types/context'

/**
 * `failed` means the build itself failed on the server (503); retrying it asks the server to
 * rebuild (OI-27). `error` means the request failed (network, permissions) and retry just refetches.
 */
export type ContextPhase = 'building' | 'ready' | 'error' | 'failed' | 'waiting'
type State = { id: string | null; context: CandidateContext | null; phase: ContextPhase; message?: string; stages?: BuildStage[] }

export function useCandidateContext(id: string | null, enabled = true) {
  const [attempt, setAttempt] = useState<{ n: number; rebuild: boolean }>({ n: 0, rebuild: false })
  const [state, setState] = useState<State>({ id: null, context: null, phase: 'building' })
  const current = state.id === id ? state : null
  const failed = current?.phase === 'failed'
  const retry = useCallback(() => {
    setState({ id, context: null, phase: 'building' })
    setAttempt(previous => ({ n: previous.n + 1, rebuild: failed }))
  }, [id, failed])
  useEffect(() => {
    if (!id || !enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let calls = 0
    const poll = async () => {
      try {
        const result = await api.getCandidateContext(id)
        if (cancelled) return
        calls++
        if ('status' in result) {
          setState({ id, context: null, phase: calls >= 10 ? 'waiting' : 'building', stages: result.stages })
          if (calls < 10) timer = setTimeout(() => { void poll() }, 3000)
        } else setState({ id, context: result, phase: 'ready' })
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 503) setState({ id, context: null, phase: 'failed', message: error.detail })
        else setState({ id, context: null, phase: 'error' })
      }
    }
    const start = async () => {
      if (attempt.rebuild) {
        try { await api.rebuildCandidateContext(id) }
        catch (error) {
          // 409: someone already restarted it or it finished; just read the current state.
          if (!(error instanceof ApiError && error.status === 409)) { if (!cancelled) setState({ id, context: null, phase: 'error' }); return }
        }
        if (cancelled) return
      }
      await poll()
    }
    void start()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id, attempt, enabled])
  // Live stages while building; the published ones once ready.
  const stages = current?.context?.build_stages ?? current?.stages ?? []
  return { context: current?.context ?? null, phase: current?.phase ?? 'building' as const, message: current?.message, stages, retry }
}
