import { useState } from 'react'
import { ResumeUpload } from './ResumeUpload'
import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { addFiles, checkAnalysis, removeEntry, retryAnalysis, setCorrection, uploadAll, uploadEntry, useBatchQueue, type BatchEntry } from '@/services/batchQueue'

const STATUS: Record<BatchEntry['phase'], string> = {
  queued: 'Ready to upload', invalid: 'Cannot upload', uploading: 'Uploading…', rejected: 'Rejected',
  needs_identity: 'Needs candidate details', failed: 'Upload failed', analyzing: 'Uploaded · analyzing…',
  analyzed: 'Analyzed', analysis_failed: 'Analysis failed', analysis_slow: 'Still analyzing',
}
const PROGRESS: Partial<Record<BatchEntry['phase'], string>> = { uploading: '33%', analyzing: '66%', analysis_slow: '66%', analyzed: '100%' }
const FIELD_LABEL = { email: 'Email', full_name: 'Full name' } as const

function EntryRow({ entry, busy }: { entry: BatchEntry; busy: boolean }) {
  const { openCandidateDetail, startPipeline } = useJob()
  const name = entry.file.name
  const working = entry.phase === 'uploading'
  return <li data-phase={entry.phase}>
    <div><span>{name} · {(entry.file.size / 1024 / 1024).toFixed(1)} MB</span><button disabled={working} aria-label={`Remove ${name}`} onClick={() => removeEntry(entry.id)}>×</button></div>
    <small role="status">{STATUS[entry.phase]}{entry.message ? ` — ${entry.message}` : ''}</small>
    <div className="upload-track"><span style={{ width: PROGRESS[entry.phase] ?? '0%' }} /></div>
    {entry.phase === 'needs_identity' && entry.field && <form className="batch-identity" onSubmit={event => { event.preventDefault(); uploadEntry(entry.id) }}>
      <label>{FIELD_LABEL[entry.field]} for {name}<input type={entry.field === 'email' ? 'email' : 'text'} maxLength={entry.field === 'email' ? 254 : 150} value={entry.corrections[entry.field]} onChange={event => setCorrection(entry.id, entry.field!, event.target.value)} /></label>
      <button disabled={busy || !entry.corrections[entry.field].trim()}>Upload with correction</button>
    </form>}
    <div className="batch-entry-actions">
      {entry.phase === 'failed' && <button disabled={busy} onClick={() => uploadEntry(entry.id)}>Retry {name}</button>}
      {entry.phase === 'analysis_failed' && <button onClick={() => void retryAnalysis(entry.id)}>Retry analysis for {name}</button>}
      {entry.phase === 'analysis_slow' && <button onClick={() => checkAnalysis(entry.id)}>Check {name} again</button>}
      {entry.candidateId && (entry.phase === 'analyzing' || entry.phase === 'analysis_slow' || entry.phase === 'analysis_failed') && <button onClick={() => startPipeline(entry.candidateId!)}>View progress for {name}</button>}
      {entry.candidateId && entry.phase === 'analyzed' && <button onClick={() => openCandidateDetail(entry.candidateId!)}>View {name}</button>}
    </div>
  </li>
}

export function AddCandidatesView() {
  const { selectedJob, setActiveView } = useJob()
  const { hasRole } = useAuth()
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const { entries, running } = useBatchQueue()
  const pending = entries.filter(entry => ['queued', 'failed'].includes(entry.phase)).length
  const count = (phase: BatchEntry['phase']) => entries.filter(entry => entry.phase === phase).length
  const allAnalyzed = entries.length > 0 && entries.every(entry => entry.phase === 'analyzed')
  const summary = entries.length ? [
    ['analyzed', 'analyzed'], ['analyzing', 'analyzing'], ['analysis_failed', 'analysis failed'], ['needs_identity', 'need details'], ['rejected', 'rejected'], ['invalid', 'invalid'], ['failed', 'upload failed'],
  ].flatMap(([phase, label]) => count(phase as BatchEntry['phase']) ? [`${count(phase as BatchEntry['phase'])} ${label}`] : []).join(' · ') : ''
  return <section className="candidate-creation"><header className="resume-intake-header"><button className="resume-intake-brand" aria-label="Back to job" onClick={() => setActiveView('job-detail')}><b>S</b><span>skitrace</span></button><span className="resume-intake-crumb">{selectedJob?.title || 'Job'} - Add Candidates</span><span className="resume-intake-saved">Requirements saved</span></header><div className="resume-intake-content"><h1>Add Candidates</h1><p className="creation-subtitle">Upload resumes to discover the evidence behind each candidate.</p>{hasRole('recruiter') ? <><div className="upload-mode">{(['single','batch'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{value === 'single' ? 'Single Resume' : 'Batch Upload'}</button>)}</div><div className="candidate-upload-columns"><section className={'creation-card ' + (mode === 'single' ? 'selected-upload' : '')}><h3><span className="material-symbols-outlined" aria-hidden="true">description</span>Single Resume</h3><ResumeUpload pipeline /></section><section className={'creation-card ' + (mode === 'batch' ? 'selected-upload' : '')}><h3><span className="material-symbols-outlined" aria-hidden="true">stacks</span>Batch Upload · {entries.length} files queued</h3><div className="creation-drop batch-resume-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files) }}><label className="creation-browse" htmlFor="batch-resumes"><span className="material-symbols-outlined" aria-hidden="true">upload</span>Drop multiple resumes here</label><input className="file-hidden" id="batch-resumes" aria-label="Batch resume files" type="file" multiple accept=".pdf,.docx,.txt" onChange={event => { if (event.target.files) addFiles(event.target.files); event.target.value = '' }} /></div>
    <ul className="batch-files">{entries.map(entry => <EntryRow key={entry.id} entry={entry} busy={running} />)}</ul>
    {summary && <p className="batch-summary" role="status">{summary}</p>}
    <button className="batch-start" disabled={running || !pending} onClick={() => void uploadAll()}>{running ? 'Uploading resumes…' : `Start Batch Analysis (${pending})`}</button>
    {allAnalyzed && <button onClick={() => setActiveView('talent-pool')}>View candidates</button>}
    {entries.some(entry => entry.phase === 'analyzing') && <p className="batch-note">Uploaded resumes keep analyzing if you leave this page; the queue is kept until you sign out or reload.</p>}
    </section></div></> : <p role="alert">Your role cannot upload candidate resumes.</p>}</div></section>
}
