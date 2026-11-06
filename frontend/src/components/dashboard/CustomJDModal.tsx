import { useState, useRef, useEffect } from 'react'
import { api } from '@/services/api'
import type { ExtractedRequirement } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { extractDocumentText } from '@/services/documentText'

export function CustomJDModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createCustomJob } = useJob()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [location, setLocation] = useState('Remote')
  const [employment, setEmployment] = useState('')
  const [experience, setExperience] = useState('')
  const [manager, setManager] = useState('')
  const [mandatory, setMandatory] = useState('')
  const [preferred, setPreferred] = useState('')
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'paste'|'upload'>('paste')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.querySelector<HTMLInputElement>('#jd-title')?.focus()
    const requestRef = request
    return () => { requestRef.current++; document.body.style.overflow = overflow; previous?.focus() }
  }, [isOpen])
  if (!isOpen) return null
  async function read(file?: File) {
    if (!file) return
    const id = ++request.current
    setBusy(true); setError(''); setLoaded('')
    try {
      const value = await extractDocumentText(file)
      if (id !== request.current) return
      setText(value); setLoaded(file.name)
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g,' '))
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not read this document.') }
    finally { if (id === request.current) setBusy(false) }
  }
  async function save() {
    if (busy) return
    if (title.trim().length < 2) { setError('Please provide a job title with at least 2 characters.'); return }
    if (text.trim().length < 50) { setError('Job description must be at least 50 characters.'); return }
    if (department.trim().length < 2 || location.trim().length < 2) { setError('Provide a department and location with at least 2 characters.'); return }
    setBusy(true); setError('')
    const id = ++request.current
    let extractionFailed = false
    let requirements: ExtractedRequirement[] = []
    try { requirements = await api.extractRequirements({ jd_text: text.trim() }) }
    catch { extractionFailed = true }
    if (id !== request.current) return
    const explicit = [...mandatory.split(/[,\n]/).map(v => ({text:v.trim(), mandatory:true})), ...preferred.split(/[,\n]/).map(v => ({text:v.trim(), mandatory:false}))].filter(v => v.text)
    const seen = new Set<string>()
    const overrides = explicit.filter(v => { const key=v.text.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true }).map((v,i) => ({id:`manual-${i}`, requirement_text:v.text, normalized_text:v.text.toLowerCase(), category:'Other' as const, is_mandatory:v.mandatory, skill_aliases:[]}))
    requirements = [...overrides, ...requirements.filter(r => !seen.has(r.requirement_text.toLowerCase()))]
    const details = [employment.trim() && `Employment type: ${employment.trim()}`, experience.trim() && `Experience range: ${experience.trim()}`, manager.trim() && `Hiring manager: ${manager.trim()}`].filter(Boolean)
    const description = [text.trim(), ...details, mandatory.trim() && `Mandatory skills: ${mandatory.trim()}`, preferred.trim() && `Preferred skills: ${preferred.trim()}`].filter(Boolean).join('\n')
    try {
      await createCustomJob(title.trim(), description, department.trim(), location.trim(), requirements, extractionFailed && !requirements.length)
      if(id === request.current) onClose()
    } catch { if(id === request.current) setError('Could not save this requisition. Please retry.') }
    finally { if(id === request.current) setBusy(false) }
  }
  return <div className="modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="jd-heading" className="modal-panel page-stack" onKeyDown={e => {
    if(e.key === 'Escape' && !busy) { e.preventDefault(); onClose() }
    if(e.key === 'Tab') {
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])
      const first=controls[0],last=controls[controls.length-1]
      if(e.shiftKey && document.activeElement === first) { e.preventDefault();last?.focus() }
      if(!e.shiftKey && document.activeElement === last) { e.preventDefault();first?.focus() }
    }
  }}><div className="page-heading"><h1 id="jd-heading">Create requisition</h1><button disabled={busy} onClick={onClose}>Close dialog</button></div><p>Step {step} of 2 · Role and requirements</p>
  <div className="form-grid"><div><label htmlFor="jd-title">Job Title *</label><input id="jd-title" value={title} maxLength={150} onChange={e => setTitle(e.target.value)} /></div><div><label htmlFor="jd-dept">Department</label><input id="jd-dept" value={department} maxLength={100} onChange={e => setDepartment(e.target.value)} /></div><div><label htmlFor="jd-location">Location</label><input id="jd-location" value={location} maxLength={100} onChange={e => setLocation(e.target.value)} /></div><div><label htmlFor="jd-employment">Employment type</label><input id="jd-employment" value={employment} onChange={e => setEmployment(e.target.value)} /></div><div><label htmlFor="jd-experience">Experience range</label><input id="jd-experience" value={experience} onChange={e => setExperience(e.target.value)} /></div><div><label htmlFor="jd-manager">Hiring manager</label><input id="jd-manager" value={manager} onChange={e => setManager(e.target.value)} /></div></div>
  <p>Employment, experience and manager details are saved in the role description. Mandatory and preferred skills are also saved as structured requirements.</p>
  <div className="profile-tabs"><button aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>Paste Text</button><button aria-pressed={tab === 'upload'} onClick={() => setTab('upload')}>Upload Document</button></div>
  {tab === 'upload' && <div className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();void read(e.dataTransfer.files[0])}}><label htmlFor="jd-file">Drop a job description here or browse files</label><input id="jd-file" type="file" accept=".txt,.md,.pdf,.docx" disabled={busy} onChange={e => void read(e.target.files?.[0])} /></div>}
  {loaded && <p role="status">Loaded: {loaded}</p>}
  <div><label htmlFor="jd-text">Job Description Text *</label><textarea id="jd-text" rows={8} value={text} maxLength={100000} onChange={e => setText(e.target.value)} /><p>{text.length} characters</p></div>
  {step === 2 && <div className="form-grid"><div><label htmlFor="jd-mandatory">Mandatory skills (comma or newline separated)</label><textarea id="jd-mandatory" value={mandatory} onChange={e => setMandatory(e.target.value)} /></div><div><label htmlFor="jd-preferred">Preferred skills (comma or newline separated)</label><textarea id="jd-preferred" value={preferred} onChange={e => setPreferred(e.target.value)} /></div></div>}
  <p>Requirements are extracted from the current description when you save. Explicit skill requirements take precedence. If extraction is unavailable, the description is retained.</p>
  {error && <p role="alert" className="notice error">{error}</p>}
  <div className="modal-actions"><button disabled={busy} onClick={() => setStep(step === 1 ? 2 : 1)}>{step === 1 ? 'Continue to requirements' : 'Back to role'}</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving requisition…' : 'Set as Active Requisition'}</button><button disabled={busy} onClick={() => {setText('Build reliable Python and FastAPI services with PostgreSQL for production customers. Docker experience is preferred.');if(!title) setTitle('Backend Engineer')}}>Load Sample JD</button></div>
  </div></div>
}
