import { useState, useRef, useEffect } from 'react'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
import { extractDocumentText, MAX_DOCUMENT_CHARS } from '@/services/documentText'
import { RequirementsEditor } from './RequirementsEditor'
import { dedupeDrafts, draftKey, toRequestRequirements, type RequirementDraft } from '@/services/requirementDrafts'

/** The full text that is assessed: the description plus any additional requirements (OI-45). */
// oxlint-disable-next-line react/only-export-components -- small pure helper shared with tests.
export function assessedText(description: string, additional: string) {
  return [description.trim(), additional.trim()].filter(Boolean).join('\n\n')
}
const splitSkills = (value: string) => value.split(/[,\n]/).map(item => item.trim()).filter(Boolean)

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
  const [drafts, setDrafts] = useState<RequirementDraft[]>([])
  const [extractionFailed, setExtractionFailed] = useState(false)
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
  function checkRole(): boolean {
    if (title.trim().length < 2) { setError('Please provide a job title with at least 2 characters.'); return false }
    if (department.trim().length < 2 || location.trim().length < 2) { setError('Provide a department and location with at least 2 characters.'); return false }
    return true
  }
  /** Extract from everything that will be assessed, then show the exact list before saving (OI-45). */
  async function review() {
    if (busy || !checkRole()) return
    const assessed = assessedText(text, additional)
    if (text.trim().length < 50) { setError('Job description must be at least 50 characters.'); return }
    if (assessed.length > MAX_DOCUMENT_CHARS) { setError(`The job description and additional requirements must total at most ${MAX_DOCUMENT_CHARS.toLocaleString('en-US')} characters.`); return }
    setBusy(true); setError('')
    const id = ++request.current
    let extracted: RequirementDraft[] = []
    let failed = false
    try {
      extracted = (await api.extractRequirements({ jd_text: assessed })).map(r => ({ key: draftKey(), requirement_text: r.requirement_text, is_mandatory: r.is_mandatory }))
    } catch { failed = true }
    if (id !== request.current) return
    const explicit = [...splitSkills(mandatory).map(skill => ({ skill, required: true })), ...splitSkills(preferred).map(skill => ({ skill, required: false }))]
      .map(item => ({ key: draftKey(), requirement_text: item.skill, is_mandatory: item.required }))
    setDrafts(dedupeDrafts([...explicit, ...extracted]))
    setExtractionFailed(failed)
    setStep(3); setBusy(false)
  }
  async function save(status: 'draft' | 'active') {
    if (busy || !checkRole()) return
    const requirements = toRequestRequirements(drafts)
    if (!requirements.length) { setError('Add at least one requirement to score candidates against.'); return }
    setBusy(true); setError('')
    const id = ++request.current
    try {
      await createCustomJob({
        title: title.trim(), department: department.trim(), location: location.trim(), status,
        description_raw: assessedText(text, additional), requirements,
        employment_type: employment.trim() || null, experience_range: experience.trim() || null, hiring_manager: manager.trim() || null,
      })
      if (id === request.current) { onClose(); setActiveView(status === 'active' ? 'add-candidates' : 'job-detail') }
    } catch { if (id === request.current) setError('Could not save this requisition. Please retry.') }
    finally { if (id === request.current) setBusy(false) }
  }
  return <div className="modal-backdrop creation-overlay"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="jd-heading" className="modal-panel creation-shell" onKeyDown={e => {
    if(e.key === 'Escape' && !busy) { e.preventDefault(); onClose() }
    if(e.key === 'Tab') {
      const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])
      const first=controls[0],last=controls[controls.length-1]
      if(e.shiftKey && document.activeElement === first) { e.preventDefault();last?.focus() }
      if(!e.shiftKey && document.activeElement === last) { e.preventDefault();first?.focus() }
    }
  }}><header className="creation-header"><span className="creation-brand"><b>S</b> skitrace <span> / {step === 1 ? 'Create a New Job' : step === 2 ? 'Role / Requirements / Candidates' : 'Role / Requirements / Review'}</span></span><button disabled={busy} onClick={onClose}>Cancel</button></header>
  <main className={'creation-content ' + (step !== 1 ? 'requirements-content' : '')}>
  <h1 id="jd-heading">{step === 1 ? 'Create a New Job' : step === 2 ? 'Define Your Hiring Requirements' : 'Review Scored Requirements'}</h1><p className="creation-subtitle">{step === 1 ? 'Define the role before discovering candidates.' : step === 2 ? 'Paste a JD or upload a document - skitrace structures it into verifiable requirements.' : 'Candidates are scored against exactly these requirements. Edit, remove or add any before saving.'}</p>
  {step === 1 ? <><section className="creation-card"><h2>Role details</h2><div className="form-grid">
  <div><label htmlFor="jd-title">Job title</label><input id="jd-title" placeholder="e.g. Backend Engineer" value={title} maxLength={150} onChange={e => setTitle(e.target.value)} /></div>
  <div><label htmlFor="jd-dept">Department</label><input id="jd-dept" placeholder="e.g. Engineering" value={department} maxLength={100} onChange={e => setDepartment(e.target.value)} /></div>
  <div><label htmlFor="jd-location">Location</label><input id="jd-location" placeholder="e.g. Remote / Berlin" value={location} maxLength={100} onChange={e => setLocation(e.target.value)} /></div>
  <div><label htmlFor="jd-employment">Employment type</label><select id="jd-employment" value={employment} onChange={e => setEmployment(e.target.value)}><option value="">Select type</option>{['Full-time','Part-time','Contract','Internship'].map(v => <option key={v}>{v}</option>)}</select></div>
  <div><label htmlFor="jd-experience">Experience range</label><input id="jd-experience" placeholder="e.g. 3-6 years" value={experience} onChange={e => setExperience(e.target.value)} /></div>
  <div><label htmlFor="jd-manager">Hiring manager</label><input id="jd-manager" placeholder="e.g. Elena Marsh" value={manager} onChange={e => setManager(e.target.value)} /></div>
  </div><label htmlFor="jd-summary">Job description</label><input id="jd-summary" placeholder="Summarize responsibilities, stack and expectations... (or paste full JD in next step)" value={text} onChange={e => setText(e.target.value)} /></section>
  <section className="creation-card"><h2>Skill requirements</h2><div className="form-grid"><div><label htmlFor="jd-mandatory">Mandatory skills</label><input id="jd-mandatory" placeholder="Python, FastAPI" value={mandatory} onChange={e => setMandatory(e.target.value)} /><small>Candidates must show evidence for these. Separate skills with commas.</small></div><div><label htmlFor="jd-preferred">Preferred skills</label><input id="jd-preferred" placeholder="Docker, AWS" value={preferred} onChange={e => setPreferred(e.target.value)} /><small>Nice to have - boosts job fit.</small></div></div><label htmlFor="jd-additional">Additional requirements</label><input id="jd-additional" placeholder="e.g. System design experience, async processing, EU work permit..." value={additional} onChange={e => setAdditional(e.target.value)} /></section></> : step === 2 ? <>
  <div className="requirements-columns"><section className="creation-card paste-card"><label htmlFor="jd-text">A. Paste Job Description</label><textarea id="jd-text" rows={10} placeholder="Paste the full job description here..." value={text} maxLength={100000} onChange={e => setText(e.target.value)} /><div className="creation-meta"><small>{text.length.toLocaleString()} characters - Review requirements below</small><button onClick={() => setText('')}>Clear</button></div></section>
  <section className="creation-card"><h3>B. Upload Job Description</h3><div className="creation-drop" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();void read(e.dataTransfer.files[0])}}><span className="material-symbols-outlined">description</span><p>Drag & drop your JD here</p><small>PDF, DOCX, TXT or MD, up to 5 MB</small><label className="creation-browse" htmlFor="jd-file">Browse file</label><input id="jd-file" className="file-hidden" type="file" accept=".txt,.md,.pdf,.docx" disabled={busy} onChange={e => void read(e.target.files?.[0])} /></div>{loaded && <p className="creation-file" role="status">{loaded} - Loaded successfully</p>}</section></div>
  <section className="creation-card"><h3>Structured requirements</h3><p className="creation-subtitle">Skills entered for this role. The description and additional requirements are extracted into a list you review next.</p><div className="form-grid"><div><label htmlFor="jd-mandatory">Mandatory skills</label><input id="jd-mandatory" value={mandatory} onChange={e => setMandatory(e.target.value)} /></div><div><label htmlFor="jd-preferred">Preferred skills</label><input id="jd-preferred" value={preferred} onChange={e => setPreferred(e.target.value)} /></div></div><label htmlFor="jd-additional">Additional requirements</label><input id="jd-additional" value={additional} onChange={e => setAdditional(e.target.value)} />{experience && <p>Experience: {experience}</p>}</section></> : <section className="creation-card" aria-labelledby="scored-heading"><h3 id="scored-heading">Requirements that will be scored ({toRequestRequirements(drafts).length})</h3>
    {extractionFailed && <p role="alert" className="notice error">Automatic extraction failed, so only the skills you entered are listed. <button type="button" disabled={busy} onClick={() => void review()}>Retry extraction</button></p>}
    <RequirementsEditor value={drafts} onChange={setDrafts} idPrefix="jd-req" /></section>}
  {error && <p role="alert" className="notice error">{error}</p>}
  <footer className="creation-actions"><button disabled={busy} onClick={() => step === 1 ? onClose() : setStep(step - 1)}>{step === 1 ? 'Cancel' : step === 2 ? 'Back to role' : 'Back to description'}</button>
  {step === 1 && <button className="creation-primary" onClick={() => { if (!checkRole()) return; setError(''); setStep(2) }}>Save & Continue</button>}
  {step === 2 && <button className="creation-primary" disabled={busy} onClick={() => void review()}>{busy ? 'Extracting requirements...' : 'Review requirements'}</button>}
  {step === 3 && <><button disabled={busy || !toRequestRequirements(drafts).length} onClick={() => void save('draft')}>Save as draft</button><button className="creation-primary" disabled={busy || !toRequestRequirements(drafts).length} onClick={() => void save('active')}>{busy ? 'Saving job...' : 'Save & open job'}</button></>}</footer>
  </main></div></div>
}
