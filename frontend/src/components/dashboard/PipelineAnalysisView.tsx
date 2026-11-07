import { useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
import { ResumeViewer } from '@/components/profile/ResumeViewer'

export function PipelineAnalysisView() {
  const { selectedCandidateId, selectedJob, openCandidateDetail, setActiveView } = useJob()
  const { context, phase, retry } = useCandidateContext(selectedCandidateId)
  const ready = phase === 'ready' && !!context
  const sourceStage = (source: 'github' | 'linkedin' | 'leetcode', title: string, icon: string) => {
    const records = context?.evidence_records.filter(record => record.source_type === source) ?? []
    return { title, icon, state: ready ? (records.length ? 'available' : 'unavailable') : 'pending', detail: ready ? records.length ? `${records.length} attributed observations - inspect source provenance` : 'No evidence returned for this source' : 'Waiting for candidate context' }
  }
  const stages = [
    { title: 'Resume Extraction', icon: 'description', state: ready ? 'complete' : 'working', detail: ready ? `${context.claims.length} resume claims extracted - ${context.parse_source.toUpperCase()} source` : 'Processing resume and extracting candidate claims' },
    { title: 'Candidate Identification', icon: 'person', state: ready ? 'complete' : 'pending', detail: ready ? [context.candidate.full_name, context.candidate.location].filter(Boolean).join(' - ') : 'Waiting for resume extraction' },
    sourceStage('github', 'GitHub Discovery', 'code'),
    sourceStage('linkedin', 'LinkedIn Discovery', 'work'),
    sourceStage('leetcode', 'LeetCode Discovery', 'data_object'),
    { title: 'Project Analysis', icon: 'account_tree', state: ready ? (context.evidence_records.some(record => record.source_type === 'project_submission') ? 'available' : 'unavailable') : 'pending', detail: ready ? `${context.evidence_records.filter(record => record.source_type === 'project_submission').length} project observations returned` : 'Waiting for candidate context' },
    { title: 'Skill Verification', icon: 'verified', state: ready ? 'available' : 'pending', detail: ready ? `${context.claims.filter(claim => claim.verification_state === 'supported').length} supported claims - ${context.claims.filter(claim => claim.verification_state === 'unverified').length} unverified claims` : 'Claims will be assessed against available evidence' },
    { title: 'Job Matching', icon: 'fingerprint', state: 'pending', detail: selectedJob ? `Review fit against ${selectedJob.title} in the candidate dossier` : 'Select a job to evaluate candidate fit' },
  ]
  return <section className="analysis-screen">
    <aside className="analysis-resume"><header><span className="material-symbols-outlined" aria-hidden="true">description</span><div><strong>{context?.candidate.full_name ? `${context.candidate.full_name} - Resume` : 'Uploaded resume'}</strong><small>{selectedCandidateId ? `Candidate ${selectedCandidateId}` : 'No candidate selected'}</small></div></header><div className="analysis-resume-paper">{selectedCandidateId ? <ResumeViewer key={selectedCandidateId} candidateId={selectedCandidateId} /> : <p>No resume selected.</p>}</div><footer><span>Resume text reference</span><button onClick={() => setActiveView('job-detail')}>Return to job</button></footer></aside>
    <main className="analysis-main"><div className="analysis-eyebrow">{ready ? 'Analysis ready' : 'Analyzing'}{selectedJob ? ` - ${selectedJob.title}` : ''}</div><h1>Discovering Candidate Intelligence</h1><p className="analysis-subtitle">Linking resume claims to available evidence across platforms.</p>
    {!selectedCandidateId ? <p>No uploaded candidate selected.</p> : <><div className="analysis-progress"><div><span>Overall progress</span><span>{ready ? 'Candidate context ready' : phase === 'error' ? 'Could not load analysis' : phase === 'waiting' ? 'Awaiting update' : 'Analysis in progress'}</span></div><div className={'analysis-progress-track ' + (phase === 'building' ? 'is-building' : '')} role="progressbar" aria-label="Candidate context processing" aria-valuemin={0} aria-valuemax={100} {...(ready ? { 'aria-valuenow': 100 } : {})}><span style={{width: ready ? '100%' : phase === 'building' ? '35%' : '0%'}} /></div></div>
    <ContextFeedback phase={phase} retry={retry} />
    <ol className="analysis-stages">{stages.map(stage => <li key={stage.title} className={`analysis-stage stage-${stage.state}`}><span className="analysis-stage-icon material-symbols-outlined" aria-hidden="true">{stage.state === 'complete' ? 'check' : stage.icon}</span><div><h2>{stage.title}<span> - {stage.state === 'complete' ? 'Completed' : stage.state === 'working' ? phase === 'error' ? 'Paused' : 'In progress' : stage.state === 'available' ? 'Results available' : stage.state === 'unavailable' ? 'No evidence available' : 'Pending'}</span></h2><p>{stage.detail}</p>{stage.state === 'working' && phase === 'building' && <div className="analysis-stage-track"><span /></div>}</div></li>)}</ol>
    {context && <p className="analysis-ready-note">Analysis ready. {context.evidence_records.length} attributed observations. Claims remain separately assessed.</p>}
    <button className="analysis-dossier" disabled={!ready} onClick={() => openCandidateDetail(selectedCandidateId)}>View Candidate Intelligence Dossier<span aria-hidden="true"> &rarr;</span></button></>}
    {ready && <button className="analysis-return" onClick={() => setActiveView('candidates')}>View all candidate results</button>}
    <button className="analysis-return" onClick={() => setActiveView('job-detail')}>Return to job (processing continues)</button></main>
  </section>
}
