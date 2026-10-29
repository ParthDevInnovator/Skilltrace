import { useRef } from 'react'
import type { RankedCandidate } from '@/types/matching'
import { RequirementFilter } from './RequirementFilter'
import { useState, useEffect } from 'react'
import type { CandidateSummary } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
import { ResumeUpload } from './ResumeUpload'
import { CandidateCard } from '@/components/cards/CandidateCard'

const POPULAR_SKILLS = ['All', 'Python', 'React', 'TypeScript', 'FastAPI', 'Kubernetes', 'Distributed Systems']

export function CandidateGrid() {
  const { selectedJob, searchQuery, setSearchQuery, selectedSkill, setSelectedSkill } = useJob()
  const [candidates, setCandidates] = useState<CandidateSummary[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const [ranked, setRanked] = useState<RankedCandidate[] | null>(null)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [requirements, setRequirements] = useState<NonNullable<import('@/types').Job['requirements']>>([])
  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([])
  const generation = useRef(0)
  // oxlint-disable-next-line react/set-state-in-effect -- Invalidate ranking when its job input changes.
  useEffect(() => { generation.current++; setRanked(null); setSelectedRequirements([]); setRankingLoading(false) }, [selectedJob?.id])
  async function rank() {
    if (!selectedJob) return
    const current = ++generation.current
    setRankingLoading(true); setError(null)
    try {
      const [rows, reqs] = await Promise.all([api.rankCandidates({job_id:selectedJob.id}), api.extractRequirements({job_id:selectedJob.id})])
      if (current === generation.current) { setRanked(rows); setRequirements(reqs); setSelectedRequirements([]) }
    } catch { if (current === generation.current) setError('Could not rank candidates. Please retry.') }
    finally { if (current === generation.current) setRankingLoading(false) }
  }
  const visible = ranked ? ranked.filter(row => selectedRequirements.every(id => row.coverage.some(c => c.requirement_id===id && ['matched','partially_supported'].includes(c.coverage_state)))).flatMap(row => candidates.filter(c=>c.id===row.candidate_id)) : candidates
  const loading = isLoading || rankingLoading

  useEffect(() => {
    let isMounted = true
    async function fetchCandidates() {
      try {
        setIsLoading(true)
        setError(null)
        const params = {
          search: searchQuery.trim() || undefined,
          skill: selectedSkill && selectedSkill !== 'All' ? selectedSkill : undefined,
        }
        const data = await api.getCandidates(params)
        if (isMounted) {
          setCandidates(data)
        }
      } catch (err) {
        console.error('Failed to fetch candidates:', err)
        if (isMounted) {
          setError('Failed to fetch candidates from server.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    const timer = setTimeout(() => {
      fetchCandidates()
    }, 150)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchQuery, selectedSkill])

  return (
    <div className="flex flex-col gap-5">
      <ResumeUpload />
      {/* Search & Filter Bar */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Skill filter pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[#656170] mr-1">Filter by Skill:</span>
          {POPULAR_SKILLS.map((skill) => {
            const isActive =
              skill === 'All' ? !selectedSkill || selectedSkill === 'All' : selectedSkill === skill
            return (
              <button
                key={skill}
                aria-pressed={isActive}
                type="button"
                onClick={() => setSelectedSkill(skill === 'All' ? '' : skill)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#6554c0] text-white shadow-xs'
                    : 'bg-[#f1f3fe] text-[#484552] hover:bg-[#ebedf9]'
                }`}
              >
                {skill}
              </button>
            )
          })}
        </div>

        {/* Results Count & Reset */}
        <div className="flex items-center gap-3 text-xs text-[#65646f] self-end md:self-auto">
          <span role="status" aria-live="polite">
            Showing <strong className="text-[#181c23]">{visible.length}</strong> candidates
          </span>
          {(searchQuery || selectedSkill) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setSelectedSkill('')
              }}
              className="text-[#6554c0] font-medium hover:underline flex items-center gap-1"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">refresh</span>
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {selectedJob && <div className="modal-actions"><button className="primary-button" disabled={rankingLoading} onClick={()=>void rank()}>Rank by fit</button>{ranked && <button onClick={()=>{ generation.current++; setRanked(null); setSelectedRequirements([]); setRankingLoading(false) }}>Back to default order</button>}</div>}
      {selectedJob && ranked && <RequirementFilter requirements={requirements} selected={selectedRequirements} onChange={setSelectedRequirements} />}
      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white border border-[#e5e7eb] rounded-xl p-5 h-44 animate-pulse flex flex-col justify-between"
            >
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#ebedf9]"></div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-4 bg-[#ebedf9] rounded w-3/4"></div>
                  <div className="h-3 bg-[#ebedf9] rounded w-1/2"></div>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-5 bg-[#ebedf9] rounded w-16"></div>
                <div className="h-5 bg-[#ebedf9] rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div role="alert" className="bg-[#fdf2f2] border border-[#f5c4c4] text-[#b54747] p-6 rounded-xl text-center flex flex-col items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[32px]">error</span>
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && visible.length === 0 && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#f1eefc] text-[#6554c0] flex items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined text-[24px]">person_search</span>
          </div>
          <h3 className="text-base font-semibold text-[#181c23]">No Candidates Found</h3>
          <p className="text-xs text-[#65646f] max-w-sm">
            No candidates matched your search criteria{' '}
            {searchQuery && <span>"{searchQuery}"</span>}{' '}
            {selectedSkill && <span>with skill "{selectedSkill}"</span>}.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setSelectedSkill('')
            }}
            className="mt-2 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#6554c0] text-white hover:bg-[#5545a8]"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Candidate Cards Grid */}
      {!loading && !error && visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((cand) => (
            <CandidateCard key={cand.id} candidate={cand} ranking={ranked?.find(r=>r.candidate_id===cand.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
