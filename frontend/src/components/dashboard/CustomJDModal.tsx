import { useState, useRef, useEffect } from 'react'
import { api } from '@/services/api'
import type { ExtractedRequirement } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { extractDocumentText } from '@/services/documentText'

export function CustomJDModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createCustomJob, setActiveView } = useJob()
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
  const [additional, setAdditional] = useState('')
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
    const description = [text.trim(), additional.trim(), ...details, mandatory.trim() && `Mandatory skills: ${mandatory.trim()}`, preferred.trim() && `Preferred skills: ${preferred.trim()}`].filter(Boolean).join('\n')
    try {
      await createCustomJob(title.trim(), description, department.trim(), location.trim(), requirements, extractionFailed && !requirements.length)
      if(id === request.current) { onClose(); setActiveView('add-candidates') }
    } catch { if(id === request.current) setError('Could not save this requisition. Please retry.') }
    finally { if(id === request.current) setBusy(false) }
  }
  return <div className="modal-backdrop creation-overlay"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="jd-heading" className="modal-panel creation-shell" onKeyDown={e => {
    if(e.key === 'Escape' && !busy) { e.preventDefault(); onClose() }
    if(e.key === 'Tab') {
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])
      const first=controls[0],last=controls[controls.length-1]
      if(e.shiftKey && document.activeElement === first) { e.preventDefault();last?.focus() }
      if(!e.shiftKey && document.activeElement === last) { e.preventDefault();first?.focus() }
    }
  }}><header className="creation-header"><span className="creation-brand"><b>S</b> skitrace <span> / {step === 1 ? 'Create a New Job' : 'Role / Requirements / Candidates'}</span></span><button disabled={busy} onClick={onClose}>Cancel</button></header>
  <main className={'creation-content ' + (step === 2 ? 'requirements-content' : '')}>
  <h1 id="jd-heading">{step === 1 ? 'Create a New Job' : 'Define Your Hiring Requirements'}</h1><p className="creation-subtitle">{step === 1 ? 'Define the role before discovering candidates.' : 'Paste a JD or upload a document - skitrace structures it into verifiable requirements.'}</p>
  {step === 1 ? <><section className="creation-card"><h2>Role details</h2><div className="form-grid">
  <div><label htmlFor="jd-title">Job title</label><input id="jd-title" placeholder="e.g. Backend Engineer" value={title} maxLength={150} onChange={e => setTitle(e.target.value)} /></div>
  <div><label htmlFor="jd-dept">Department</label><input id="jd-dept" placeholder="e.g. Engineering" value={department} maxLength={100} onChange={e => setDepartment(e.target.value)} /></div>
  <div><label htmlFor="jd-location">Location</label><input id="jd-location" placeholder="e.g. Remote / Berlin" value={location} maxLength={100} onChange={e => setLocation(e.target.value)} /></div>
  <div><label htmlFor="jd-employment">Employment type</label><select id="jd-employment" value={employment} onChange={e => setEmployment(e.target.value)}><option value="">Select type</option>{['Full-time','Part-time','Contract','Internship'].map(v => <option key={v}>{v}</option>)}</select></div>
  <div><label htmlFor="jd-experience">Experience range</label><input id="jd-experience" placeholder="e.g. 3-6 years" value={experience} onChange={e => setExperience(e.target.value)} /></div>
  <div><label htmlFor="jd-manager">Hiring manager</label><input id="jd-manager" placeholder="e.g. Elena Marsh" value={manager} onChange={e => setManager(e.target.value)} /></div>
  </div><label htmlFor="jd-summary">Job description</label><input id="jd-summary" placeholder="Summarize responsibilities, stack and expectations... (or paste full JD in next step)" value={text} onChange={e => setText(e.target.value)} /></section>
  <section className="creation-card"><h2>Skill requirements</h2><div className="form-grid"><div><label htmlFor="jd-mandatory">Mandatory skills</label><input id="jd-mandatory" placeholder="Python, FastAPI" value={mandatory} onChange={e => setMandatory(e.target.value)} /><small>Candidates must show evidence for these. Separate skills with commas.</small></div><div><label htmlFor="jd-preferred">Preferred skills</label><input id="jd-preferred" placeholder="Docker, AWS" value={preferred} onChange={e => setPreferred(e.target.value)} /><small>Nice to have - boosts job fit.</small></div></div><label htmlFor="jd-additional">Additional requirements</label><input id="jd-additional" placeholder="e.g. System design experience, async processing, EU work permit..." value={additional} onChange={e => setAdditional(e.target.value)} /></section></> : <>
  <div className="requirements-columns"><section className="creation-card paste-card"><label htmlFor="jd-text">A. Paste Job Description</label><textarea id="jd-text" rows={10} placeholder="Paste the full job description here..." value={text} maxLength={100000} onChange={e => setText(e.target.value)} /><div className="creation-meta"><small>{text.length.toLocaleString()} characters - Review requirements below</small><button onClick={() => setText('')}>Clear</button></div></section>
  <section className="creation-card"><h3>B. Upload Job Description</h3><div className="creation-drop" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();void read(e.dataTransfer.files[0])}}><span className="material-symbols-outlined">description</span><p>Drag & drop your JD here</p><small>PDF or DOCX, up to 10 MB</small><label className="creation-browse" htmlFor="jd-file">Browse file</label><input id="jd-file" className="file-hidden" type="file" accept=".txt,.md,.pdf,.docx" disabled={busy} onChange={e => void read(e.target.files?.[0])} /></div>{loaded && <p className="creation-file" role="status">{loaded} - Loaded successfully</p>}</section></div>
  <section className="creation-card"><h3>Structured requirements</h3><p className="creation-subtitle">Skills entered for this role. Additional requirements are extracted when you save.</p><div className="form-grid"><div><label htmlFor="jd-mandatory">Mandatory skills</label><input id="jd-mandatory" value={mandatory} onChange={e => setMandatory(e.target.value)} /></div><div><label htmlFor="jd-preferred">Preferred skills</label><input id="jd-preferred" value={preferred} onChange={e => setPreferred(e.target.value)} /></div></div>{experience && <p>Experience: {experience}</p>}</section></>}
  {error && <p role="alert" className="notice error">{error}</p>}
  <footer className="creation-actions"><button disabled={busy} onClick={() => step === 2 ? setStep(1) : onClose()}>{step === 1 ? 'Cancel' : 'Back to role'}</button>{step === 1 ? <button className="creation-primary" onClick={() => { if(title.trim().length < 2) {setError('Please provide a job title with at least 2 characters.');return} setError('');setStep(2) }}>Save & Continue</button> : <button className="creation-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving requirements...' : 'Save Job Requirements'}</button>}</footer>
  </main></div></div>
}
