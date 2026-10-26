import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import type { ResumePayload } from '@/types/context'
export function ResumeViewer({ candidateId }: { candidateId: string }) {
  const [data, setData] = useState<ResumePayload | null>(null)
  const [phase, setPhase] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  useEffect(() => {
    let cancelled = false
    api.getCandidateResume(candidateId).then(result => { if (!cancelled) { setData(result); setPhase('ready') } }).catch(() => { if (!cancelled) setPhase('error') })
    return () => { cancelled = true }
  }, [candidateId, attempt])
  return <section className="panel"><h2>Resume Reference</h2>{phase === 'loading' ? <p role="status">Loading resume...</p> : phase === 'error' ? <div role="alert">Resume could not be loaded. <button onClick={() => { setPhase('loading'); setAttempt(value => value + 1) }}>Retry resume</button></div> : !data ? <p>No resume text is available.</p> : <>
    <p>Source: <strong>{data.source.toUpperCase()}</strong>{data.source === 'stub' && ' - Synthetic fallback, not an original document'}</p>
    <button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(data.raw_text); setCopyStatus('Copied resume text') } catch { setCopyStatus('Copy unavailable. Select the text below to copy it.') } }}>Copy resume text</button><span role="status">{copyStatus}</span><pre className="resume-text">{data.raw_text}</pre>
  </>}</section>
}
