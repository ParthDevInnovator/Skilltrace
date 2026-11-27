import { useCallback, useEffect, useState } from 'react'
import { api, type RankingScope } from '@/services/api'
import type { RankedCandidate } from '@/types/matching'

export const RANKING_POLL_MS = 4000
export const RANKING_POLL_LIMIT = 15

export interface JobRanking { rows: RankedCandidate[]; error: boolean }

/**
 * Rankings for one or more jobs. While any candidate is still `building`, the jobs that
 * contain such rows are re-ranked every few seconds (bounded), so finished background
 * analysis appears without leaving the screen (OI-13). After the limit, `exhausted` is set
 * and `refresh()` starts a new bounded cycle.
 */
export function useRankings(jobIds: string[], enabled = true, scope: RankingScope = 'pool') {
  const key = enabled && jobIds.length ? `${scope}:${jobIds.join('|')}` : ''
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ key: string; byJob: Record<string, JobRanking>; exhausted: boolean }>({ key: '', byJob: {}, exhausted: false })
  useEffect(() => {
    if (!key) return
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined, polls = 0
    const ids = key.slice(key.indexOf(':') + 1).split('|')
    const byJob: Record<string, JobRanking> = {}
    // Only send the scope when it narrows the ranking, so pool requests stay unchanged.
    const rank = (id: string) => api.rankCandidates(scope === 'pool' ? { job_id: id } : { job_id: id, scope })
      .then(rows => { byJob[id] = { rows, error: false } })
      .catch(() => { byJob[id] = { rows: [], error: true } })
    const pending = () => ids.filter(id => byJob[id]?.rows.some(row => row.context_status === 'building'))
    const run = async (targets: string[]) => {
      await Promise.all(targets.map(rank))
      if (cancelled) return
      const building = pending()
      const exhausted = building.length > 0 && polls >= RANKING_POLL_LIMIT
      setState({ key, byJob: { ...byJob }, exhausted })
      if (building.length && !exhausted) { polls++; timer = setTimeout(() => { void run(building) }, RANKING_POLL_MS) }
    }
    void run(ids)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, attempt, scope])
  const refresh = useCallback(() => setAttempt(value => value + 1), [])
  const current = state.key === key ? state : null
  return {
    byJob: current?.byJob ?? {},
    loaded: !!current,
    processing: !!current && Object.values(current.byJob).some(job => job.rows.some(row => row.context_status === 'building')),
    exhausted: current?.exhausted ?? false,
    refresh,
  }
}

/** Single-job convenience wrapper. `rows` is null until the first response arrives. */
export function useRanking(jobId: string | null | undefined, enabled = true, scope: RankingScope = 'pool') {
  const { byJob, loaded, processing, exhausted, refresh } = useRankings(jobId ? [jobId] : [], enabled && !!jobId, scope)
  const job = jobId ? byJob[jobId] : undefined
  return { rows: loaded ? job?.rows ?? [] : null, error: job?.error ?? false, processing, exhausted, refresh }
}
