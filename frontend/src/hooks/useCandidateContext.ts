import { useCallback, useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { CandidateContext } from '@/types/context'

export function useCandidateContext(id: string | null, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ id: string | null; context: CandidateContext | null; phase: 'building' | 'ready' | 'error' | 'waiting' }>({ id: null, context: null, phase: 'building' })
  const retry = useCallback(() => { setState({ id, context: null, phase: 'building' }); setAttempt(value => value + 1) }, [id])
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
          setState({ id, context: null, phase: calls >= 10 ? 'waiting' : 'building' })
          if (calls < 10) timer = setTimeout(() => { void poll() }, 3000)
        } else setState({ id, context: result, phase: 'ready' })
      } catch {
        if (!cancelled) setState({ id, context: null, phase: 'error' })
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id, attempt, enabled])
  return { context: state.id === id ? state.context : null, phase: state.id === id ? state.phase : 'building' as const, retry }
}
