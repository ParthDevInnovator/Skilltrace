import { useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { useJdMatch } from '@/hooks/useJdMatch'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
import { ResumeViewer } from '@/components/profile/ResumeViewer'
import type { BuildStage, BuildStageName, CandidateContext } from '@/types/context'

type UiState = 'complete' | 'working' | 'available' | 'unavailable' | 'skipped' | 'failed' | 'pending'
interface StageView { title: string; icon: string; state: UiState; detail: string; timing?: string }

const LABEL: Record<UiState, string> = {
  complete: 'Completed', working: 'In progress', available: 'Results available', unavailable: 'No evidence available',
  skipped: 'Not checked', failed: 'Failed', pending: 'Pending',
}
const DONE: BuildStage['state'][] = ['complete', 'skipped', 'unavailable']

function timing(stage?: BuildStage) {
  if (!stage?.started_at || !stage.finished_at) return undefined
  const ms = Date.parse(stage.finished_at) - Date.parse(stage.started_at)
  return ms < 1000 ? `${Math.max(ms, 0)} ms` : `${(ms / 1000).toFixed(1)} s`
}
function base(stage: BuildStage | undefined): UiState | null {
  if (!stage || stage.state === 'pending') return 'pending'
  if (stage.state === 'running') return 'working'
  if (stage.state === 'failed') return 'failed'
  return null
}

/**
 * Stages come from the build itself (OI-28): each one has its own state, count and timing, so they
 * no longer all flip together when the context becomes ready.
 */
function sourceStage(stage: BuildStage | undefined, title: string, icon: string): StageView {
  const early = base(stage)
  const n = stage?.item_count ?? 0
  if (early) return { title, icon, state: early, detail: early === 'working' ? 'Reading the profile linked on the resume' : early === 'failed' ? 'Stopped when the build failed' : 'Waiting to read the linked profile' }
  if (stage!.state === 'skipped') return { title, icon, state: 'skipped', detail: 'No profile link on the resume, so this source was not checked', timing: timing(stage) }
  if (stage!.state === 'unavailable') return { title, icon, state: 'unavailable', detail: 'The source could not be read. This is an outage, not missing evidence; retry later.', timing: timing(stage) }
  return { title, icon, state: n ? 'available' : 'unavailable', detail: n ? `${n} attributed observation${n === 1 ? '' : 's'} from the linked profile` : 'Profile read; no observations returned', timing: timing(stage) }
}

export function PipelineAnalysisView() {
  const { selectedCandidateId, selectedJob, openCandidateDetail, setActiveView } = useJob()
  const { context, phase, message, stages, retry } = useCandidateContext(selectedCandidateId)
  const ready = phase === 'ready' && !!context
  const match = useJdMatch(selectedCandidateId ?? '', selectedJob?.id, ready)
  const byName = Object.fromEntries(stages.map(stage => [stage.name, stage])) as Partial<Record<BuildStageName, BuildStage>>
  const measured = stages.length > 0
  const stopped = phase === 'failed' || phase === 'error'

  const extraction = byName.claim_extraction?.state === 'complete' ? byName.claim_extraction : byName.resume_parse?.state !== 'complete' ? byName.resume_parse : byName.claim_extraction
  const extractionEarly = measured ? base(extraction) : ready ? null : 'working'
  const projects = (ctx: CandidateContext) => ctx.evidence_records.filter(record => record.source_type === 'github' || record.source_type === 'project_submission').length
  const scoringEarly = measured ? base(byName.scoring) : ready ? null : 'pending'

  const matchView = (): StageView => {
    const title = 'Job Matching', icon = 'fingerprint'
    if (!selectedJob) return { title, icon, state: 'pending', detail: 'Select a job to evaluate candidate fit' }
    if (!ready) return { title, icon, state: 'pending', detail: `Runs against ${selectedJob.title} once analysis is ready` }
    const result = match.result
    if (!result) return { title, icon, state: 'working', detail: `Matching against ${selectedJob.title}` }
    if ('status' in result) return result.status === 'building'
      ? { title, icon, state: 'working', detail: match.exhausted ? 'Match is still building; open the dossier to check again' : `Matching against ${selectedJob.title}` }
      : { title, icon, state: 'failed', detail: result.error || 'The match could not be computed' }
    const matched = result.coverage.filter(item => item.coverage_state === 'matched').length
    return { title, icon, state: 'complete', detail: `Fit ${Math.round(result.final_score * 100)}/100 for ${selectedJob.title} · ${matched} of ${result.coverage.length} requirements matched` }
  }

  const views: StageView[] = [
    extractionEarly
      ? { title: 'Resume Extraction', icon: 'description', state: extractionEarly, detail: extractionEarly === 'failed' ? 'Stopped when the build failed' : 'Reading the resume and extracting claims' }
      : { title: 'Resume Extraction', icon: 'description', state: 'complete', timing: timing(byName.claim_extraction),
          detail: context ? `${context.claims.length} resume claims extracted · ${context.parse_source.toUpperCase()} source` : `${byName.claim_extraction?.item_count ?? 0} resume claims extracted` },
    // Identity is extracted (or corrected) when the upload is accepted, before the build starts.
    { title: 'Candidate Identification', icon: 'person', state: 'complete', detail: context ? [context.candidate.full_name, context.candidate.location].filter(Boolean).join(' · ') : 'Identified from the resume at upload' },
    measured ? sourceStage(byName.github, 'GitHub Evidence', 'code') : legacySource(context, 'github', 'GitHub Evidence', 'code'),
    measured ? sourceStage(byName.linkedin, 'LinkedIn Evidence', 'work') : legacySource(context, 'linkedin', 'LinkedIn Evidence', 'work'),
    measured ? sourceStage(byName.leetcode, 'LeetCode Evidence', 'data_object') : legacySource(context, 'leetcode', 'LeetCode Evidence', 'data_object'),
    scoringEarly || !context
      ? { title: 'Project Analysis', icon: 'account_tree', state: scoringEarly ?? 'pending', detail: 'Waiting for source evidence' }
      : { title: 'Project Analysis', icon: 'account_tree', state: projects(context) ? 'available' : 'unavailable', timing: timing(byName.scoring),
          detail: `${projects(context)} repository or project observation${projects(context) === 1 ? '' : 's'}` },
    scoringEarly || !context
      ? { title: 'Claim Review', icon: 'verified', state: scoringEarly ?? 'pending', detail: 'Claims are listed once evidence is collected' }
      : { title: 'Claim Review', icon: 'verified', state: 'available',
          detail: `${context.claims.length} claims listed beside the evidence. Claims are not automatically verified; review them in the dossier.` },
    matchView(),
  ]
  const finished = measured ? stages.filter(stage => DONE.includes(stage.state)).length / stages.length : ready ? 1 : 0
  const percent = Math.round((ready ? 1 : finished) * 100)

  return <section className="analysis-screen">
    <aside className="analysis-resume"><header><span className="material-symbols-outlined" aria-hidden="true">description</span><div><strong>{context?.candidate.full_name ? `${context.candidate.full_name} - Resume` : 'Uploaded resume'}</strong><small>{selectedCandidateId ? `Candidate ${selectedCandidateId}` : 'No candidate selected'}</small></div></header><div className="analysis-resume-paper">{selectedCandidateId ? <ResumeViewer key={selectedCandidateId} candidateId={selectedCandidateId} /> : <p>No resume selected.</p>}</div><footer><span>Resume text reference</span><button onClick={() => setActiveView('job-detail')}>Return to job</button></footer></aside>
    <main className="analysis-main"><div className="analysis-eyebrow">{ready ? 'Analysis ready' : 'Analyzing'}{selectedJob ? ` - ${selectedJob.title}` : ''}</div><h1>Discovering Candidate Intelligence</h1><p className="analysis-subtitle">Linking resume claims to evidence from the profiles linked on the resume.</p>
    {!selectedCandidateId ? <p>No uploaded candidate selected.</p> : <><div className="analysis-progress"><div><span>Overall progress</span><span>{ready ? 'Candidate context ready' : phase === 'failed' ? 'Analysis failed' : phase === 'error' ? 'Could not load analysis' : phase === 'waiting' ? 'Awaiting update' : measured ? `${percent}% of build steps done` : 'Analysis in progress'}</span></div><div className={'analysis-progress-track ' + (phase === 'building' ? 'is-building' : '')} role="progressbar" aria-label="Candidate context processing" aria-valuemin={0} aria-valuemax={100} {...(ready || measured ? { 'aria-valuenow': percent } : {})}><span style={{width: ready || measured ? `${percent}%` : phase === 'building' ? '35%' : '0%'}} /></div></div>
    <ContextFeedback phase={phase} message={message} retry={retry} />
    <ol className="analysis-stages">{views.map(stage => <li key={stage.title} className={`analysis-stage stage-${stage.state}`}><span className="analysis-stage-icon material-symbols-outlined" aria-hidden="true">{stage.state === 'complete' ? 'check' : stage.icon}</span><div><h2>{stage.title}<span> - {stage.state === 'working' && stopped ? 'Paused' : LABEL[stage.state]}</span></h2><p>{stage.detail}{stage.timing ? ` · ${stage.timing}` : ''}</p>{stage.state === 'working' && phase === 'building' && <div className="analysis-stage-track"><span /></div>}</div></li>)}</ol>
    {!measured && ready && <p className="analysis-ready-note">Step timings are not available for this analysis; it was built before they were recorded.</p>}
    {context && <p className="analysis-ready-note">Analysis ready. {context.evidence_records.length} attributed observations. Claims remain separately assessed.</p>}
    <button className="analysis-dossier" disabled={!ready} onClick={() => openCandidateDetail(selectedCandidateId)}>View Candidate Intelligence Dossier<span aria-hidden="true"> &rarr;</span></button></>}
    {ready && <button className="analysis-return" onClick={() => setActiveView('candidates')}>View all candidate results</button>}
    <button className="analysis-return" onClick={() => setActiveView('job-detail')}>Return to job (processing continues)</button></main>
  </section>
}

/** Contexts built before stages were recorded: derive what can be read from the result only. */
function legacySource(context: CandidateContext | null, source: 'github' | 'linkedin' | 'leetcode', title: string, icon: string): StageView {
  if (!context) return { title, icon, state: 'pending', detail: 'Waiting for candidate context' }
  if (context.unavailable_sources?.includes(source)) return { title, icon, state: 'unavailable', detail: 'The source could not be read. This is an outage, not missing evidence; retry later.' }
  const n = context.evidence_records.filter(record => record.source_type === source).length
  return { title, icon, state: n ? 'available' : 'unavailable', detail: n ? `${n} attributed observation${n === 1 ? '' : 's'}` : 'No evidence returned for this source' }
}
