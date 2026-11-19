import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { ExtractedRequirement, MatchResponse } from '@/types/matching'

/**
 * The single source of role-specific coverage: the backend match for one candidate and job.
 * JD Match and the Overview both read it, so their counts always agree (OI-10).
 * `result` is null while loading; a building context is polled up to 10 times.
 */
export function useJdMatch(candidateId: string, jobId: string | null | undefined, enabled = true) {
  const [result, setResult] = useState<MatchResponse | null>(null)
  const [requirements, setRequirements] = useState<ExtractedRequirement[]>([])
  const [attempt, setAttempt] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>, count = 0
    // oxlint-disable-next-line react/set-state-in-effect -- Reset before fetching a new match or retry.
    setResult(null); setRequirements([]); setExhausted(false)
    if (!enabled || !jobId) return
    async function load() {
      try {
        const [match, reqs] = await Promise.all([api.getCandidateJdMatch(candidateId, { job_id: jobId! }), api.extractRequirements({ job_id: jobId! })])
        if (cancelled) return
        setResult(match); setRequirements(reqs)
        if ('status' in match && match.status === 'building') { if (++count < 10) timer = setTimeout(load, 3000); else setExhausted(true) }
      } catch { if (!cancelled) setResult({ status: 'failed', error: 'Could not load match.' }) }
    }
    void load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [candidateId, jobId, enabled, attempt])
  return { result, requirements, exhausted, retry: () => setAttempt(n => n + 1) }
}
