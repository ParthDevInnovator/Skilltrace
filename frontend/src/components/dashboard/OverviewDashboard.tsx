import { useEffect, useState } from 'react'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/services/api'
import type { CandidateSummary } from '@/types'
import type { CandidateContext } from '@/types/context'
import type { RankedCandidate } from '@/types/matching'
import { JobStatus } from '@/components/common/JobStatus'

type Analysis = { candidate: CandidateSummary; context: CandidateContext | null; status: 'ready' | 'building' | 'failed' }

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>
}
function initials(name: string) { return name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase() }

export function OverviewDashboard({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { jobs, selectedJob, openJobWorkspace, openCandidateDetail, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const canReadContext = hasRole('recruiter')
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [period, setPeriod] = useState('30')
  const [referenceTime] = useState(() => Date.now())
  const [rankings, setRankings] = useState<{ key: string; rows: Record<string, RankedCandidate[]> } | null>(null)
  const recentJobs = [...jobs].sort((a,b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0,3)
  const rankingKey = [...new Set([...recentJobs.map(j => j.id), ...(selectedJob ? [selectedJob.id] : [])])].join('|')

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const candidates = await api.getCandidates()
        let polls = 0
        async function poll() {
          const next: Analysis[] = await Promise.all(candidates.map(async candidate => {
            if (!canReadContext) return { candidate, context: null, status: 'building' as const }
            try {
              const context = await api.getCandidateContext(candidate.id)
              return 'status' in context ? {candidate, context:null, status:'building' as const} : {candidate, context, status:'ready' as const}
            } catch { return {candidate, context:null, status:'failed' as const} }
          }))
          if (!live) return
          setAnalyses(next); setLoading(false); setFailed(false)
          if (canReadContext && next.some(row => row.status === 'building') && ++polls < 10) timer = setTimeout(() => void poll(),3000)
        }
        await poll()
      } catch { if (live) { setFailed(true); setLoading(false) } }
    }
    void load()
    return () => { live=false; clearTimeout(timer) }
  }, [canReadContext, attempt])

  const readyKey = analyses.filter(a => a.status === 'ready').map(a => `${a.candidate.id}:${a.context?.context_built_at}`).join('|')
  useEffect(() => {
    if (!canReadContext || !rankingKey || !readyKey) return
    let live = true
    void Promise.all(rankingKey.split('|').map(async id => {
      try { return [id, await api.rankCandidates({job_id:id})] as const }
      catch { return [id, []] as const }
    })).then(rows => { if (live) setRankings({ key:`${rankingKey}:${readyKey}`,rows:Object.fromEntries(rows) }) })
    return () => { live=false }
  }, [canReadContext, rankingKey, readyKey])
  const matches = rankings?.key === `${rankingKey}:${readyKey}` ? rankings.rows : {}
  const cutoff = period === 'all' ? -Infinity : referenceTime - Number(period)*86400000
  const recent = analyses.filter(a => a.context && Date.parse(a.context.context_built_at) >= cutoff)
    .sort((a,b) => (b.context?.context_built_at ?? '').localeCompare(a.context?.context_built_at ?? ''))
  const evidence = recent.flatMap(a => a.context?.evidence_records ?? [])
  const sources = new Set(evidence.map(r => r.source_type)).size
  const candidateRows = recent.length ? recent.slice(0,3) : analyses.slice(0,3)
  const value = (n:number) => loading ? '—' : failed ? '—' : n.toLocaleString()

  return <div className="overview-dashboard">
    <div className="overview-titlebar">
      <div><h1>Your Hiring Intelligence</h1><p>Discover, analyze and compare candidates across your open roles.</p></div>
      <label className="overview-period"><Icon name="schedule" /><span className="sr-only">Analysis timeframe</span><select value={period} onChange={e => setPeriod(e.target.value)}><option value="30">Last 30 days</option><option value="7">Last 7 days</option><option value="all">All time</option></select></label>
    </div>
    <JobStatus />
    {failed && <div role="alert" className="notice error">Dashboard data could not be loaded. <button onClick={() => setAttempt(a => a+1)}>Retry dashboard</button></div>}
    <section className="overview-metrics" aria-label="Hiring metrics">
      {[
        {icon:'work',value:jobs.length.toLocaleString(),label:'Active Jobs',note:'Available requisitions'},
        {icon:'group',value:value(analyses.length),label:'Total Candidates',note:'In your talent pool'},
        {icon:'frame_person',value:canReadContext ? value(recent.length) : '—',label:'Candidates Analyzed',note:canReadContext ? `${recent.length ? Math.round(recent.length / Math.max(1,analyses.length)*100) : 0}% of current pool` : 'Recruiter access required'},
        {icon:'layers',value:canReadContext ? value(evidence.length) : '—',label:'Evidence Discovered',note:canReadContext ? `Across ${sources} ${sources === 1 ? 'platform' : 'platforms'}` : 'Recruiter access required'},
      ].map(metric => <article className="overview-metric" key={metric.label}><span className="overview-metric-icon"><Icon name={metric.icon}/></span><div><strong>{metric.value}</strong><h2>{metric.label}</h2><p>{metric.note}</p></div></article>)}
    </section>
    <div className="overview-columns">
      <section className="overview-panel overview-jobs" aria-labelledby="recent-jobs-title">
        <div className="overview-panel-heading"><h2 id="recent-jobs-title">Recent Jobs</h2><button onClick={() => setActiveView('jobs')}>View all</button></div>
        <div className="overview-job-list">
          {recentJobs.map(job => {
            const rows = matches[job.id]?.filter(r => r.context_status === 'ready') ?? []
            const top = rows.length ? Math.max(...rows.map(r => r.final_score)) : null
            return <button className="overview-job-row" key={job.id} onClick={() => openJobWorkspace(job)}><span className="overview-job-avatar" aria-hidden="true">{initials(job.title)}</span><span className="overview-row-copy"><strong>{job.title}</strong><small>{job.department} · {job.location}</small></span><span className="overview-fit">{top !== null ? `${Math.round(top*100)} top fit` : 'Not ranked'}</span><Icon name="arrow_forward" /></button>
          })}
          {!recentJobs.length && <div className="overview-empty"><Icon name="work_outline"/><p>No jobs yet</p><small>Create your first role to start building hiring context.</small></div>}
        </div>
        <button className="overview-create" disabled={!canReadContext} onClick={onOpenCustomJDModal}><Icon name="add"/>Create Job</button>
      </section>
      <div className="overview-right-column">
        <section className="overview-panel overview-analyses" aria-labelledby="recent-analysis-title">
          <div className="overview-panel-heading"><h2 id="recent-analysis-title">Recent Candidate Analyses</h2></div>
          {candidateRows.map(({candidate,context,status}) => {
            const score = selectedJob ? matches[selectedJob.id]?.find(r => r.candidate_id === candidate.id && r.context_status === 'ready') : null
            return <button className="overview-analysis-row" aria-label={`View ${candidate.full_name}'s profile`} key={candidate.id} onClick={() => openCandidateDetail(candidate.id)}><span className="overview-candidate-avatar" aria-hidden="true">{initials(candidate.full_name)}</span><span className="overview-row-copy"><strong>{candidate.full_name}</strong><small>{candidate.headline}{score ? ` · ${Math.round(score.final_score*100)} fit` : ''}</small></span><span className={`overview-analysis-status ${context ? 'ready' : ''}`}><Icon name={context ? 'fact_check' : 'schedule'}/>{context ? 'Analyzed' : !canReadContext ? 'Restricted' : status === 'failed' ? 'Unavailable' : 'Processing'}</span></button>
          })}
          {!candidateRows.length && <div className="overview-empty"><Icon name="person_search"/><p>{loading ? 'Loading candidate analyses…' : 'No candidate analyses yet'}</p><small>Upload a resume in Talent Pool to get started.</small></div>}
        </section>
        <section className="overview-activity" aria-labelledby="activity-title"><h2 id="activity-title"><Icon name="auto_awesome"/>Intelligence Activity</h2>
          {recent.length ? <ul>{recent.slice(0,3).map(({candidate,context}) => <li key={candidate.id}>Analysis ready for {candidate.full_name}: {context?.evidence_records.length ?? 0} attributed observations.</li>)}</ul> : <p>{loading ? 'Checking recent analysis activity…' : 'New analysis activity will appear here as candidates are processed.'}</p>}
        </section>
      </div>
    </div>
  </div>
}
