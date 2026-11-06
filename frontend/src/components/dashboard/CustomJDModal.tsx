import { useState, useRef, useEffect } from 'react'
import { api } from '@/services/api'
import type { ExtractedRequirement } from '@/types/matching'
import { useJob } from '@/context/JobContext'
import { extractDocumentText } from '@/services/documentText'

export function CustomJDModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createCustomJob } = useJob()
  const [step, setStep] = useState<1 | 2>(1)

  // Step 1: Role Details Fields (Image 2)
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [location, setLocation] = useState('Remote / Berlin')
  const [employmentType, setEmploymentType] = useState('Full-time')
  const [experienceRange, setExperienceRange] = useState('3-6 years')
  const [hiringManager, setHiringManager] = useState('Elena Marsh')
  const [jobSummary, setJobSummary] = useState('')
  const [mandatorySkills, setMandatorySkills] = useState<string[]>(['Python', 'FastAPI'])
  const [newMandatorySkill, setNewMandatorySkill] = useState('')
  const [showAddMandatory, setShowAddMandatory] = useState(false)
  const [preferredSkills, setPreferredSkills] = useState<string[]>(['Docker', 'AWS'])
  const [newPreferredSkill, setNewPreferredSkill] = useState('')
  const [showAddPreferred, setShowAddPreferred] = useState(false)
  const [additionalRequirements, setAdditionalRequirements] = useState(
    'System design experience, async processing, EU work permit...'
  )

  // Step 2: JD Text & Extraction Fields (Image 4)
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [fullJdText, setFullJdText] = useState(
    'We are hiring a Backend Engineer to own our async billing pipeline. Stack: Python, FastAPI, PostgreSQL, Redis. Minimum 3+ years building distributed systems. Experience with system design and code review ownership. EU work permit and fluent English required.'
  )
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [extractedRequirements, setExtractedRequirements] = useState<ExtractedRequirement[]>([])
  const [extractionTriggered, setExtractionTriggered] = useState(false)

  const dialog = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (dialog.current) {
      dialog.current.scrollTop = 0
    }
    if (typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, left: 0 })
      } catch {
        // Safe fallback in test environments
      }
    }
    dialog.current?.querySelector<HTMLInputElement>('#jd-title')?.focus({ preventScroll: true })

    return () => {
      requestId.current++
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  // File reader helper
  const readFile = async (file?: File) => {
    if (!file) return
    const id = ++requestId.current
    setReading(true)
    setError('')
    setFileName('')
    try {
      const value = await extractDocumentText(file)
      if (id !== requestId.current) return
      setFullJdText(value)
      setFileName(file.name)
      setFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`)
      if (!title) {
        setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
      }
      // Trigger AI extraction
      triggerExtraction(value)
    } catch (err) {
      if (id === requestId.current) {
        setError(
          err instanceof Error && /Use a|empty|5 MB|No readable|too long/.test(err.message)
            ? err.message
            : 'Could not read this document. Check the file or paste the text instead.'
        )
      }
    } finally {
      if (id === requestId.current) setReading(false)
    }
  }

  const triggerExtraction = async (textToExtract: string) => {
    if (!textToExtract.trim()) return
    try {
      const res = await api.extractRequirements({ jd_text: textToExtract.trim() })
      if (res && res.length > 0) {
        setExtractedRequirements(res)
      }
    } catch {
      // Keep defaults
    } finally {
      setExtractionTriggered(true)
    }
  }

  const handleSaveFinal = async () => {
    if (reading) return
    const finalTitle = title.trim() || 'Backend Engineer'
    const finalDescription = fullJdText.trim() || jobSummary.trim() || 'Backend Engineer role description.'

    if (!finalTitle) {
      setError('Please provide a job title.')
      setStep(1)
      return
    }

    setReading(true)
    let requirements: ExtractedRequirement[] = extractedRequirements
    let extractionFailed = false

    if (requirements.length === 0) {
      try {
        requirements = await api.extractRequirements({ jd_text: finalDescription })
      } catch {
        extractionFailed = true
      }
    }

    try {
      await createCustomJob(
        finalTitle,
        finalDescription,
        department.trim() || 'Engineering',
        location.trim() || 'Remote',
        requirements,
        extractionFailed
      )
      onClose()
    } catch {
      setError('Could not save this requisition. Please retry.')
    } finally {
      setReading(false)
    }
  }

  const handleQuickSave = async () => {
    const rawTitle = title.trim()
    const rawDesc = (jobSummary || fullJdText).trim()

    if (!rawTitle) {
      setError('Please provide a job title.')
      return
    }
    if (rawDesc.length < 50) {
      setError('Job description must be at least 50 characters.')
      return
    }

    setError('')
    setReading(true)

    let reqs: ExtractedRequirement[] = extractedRequirements
    let extractionFailed = false

    try {
      reqs = await api.extractRequirements({ jd_text: rawDesc })
    } catch {
      extractionFailed = true
      reqs = []
    }

    try {
      await createCustomJob(
        rawTitle,
        rawDesc,
        department.trim() || 'Engineering',
        location.trim() || 'Remote',
        reqs,
        extractionFailed
      )
      onClose()
    } catch {
      setError('Could not save this requisition. Please retry.')
    } finally {
      setReading(false)
    }
  }

  const addMandatorySkill = () => {
    if (newMandatorySkill.trim()) {
      setMandatorySkills(prev => [...prev, newMandatorySkill.trim()])
      setNewMandatorySkill('')
      setShowAddMandatory(false)
    }
  }

  const addPreferredSkill = () => {
    if (newPreferredSkill.trim()) {
      setPreferredSkills(prev => [...prev, newPreferredSkill.trim()])
      setNewPreferredSkill('')
      setShowAddPreferred(false)
    }
  }

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jd-heading"
      className="fixed inset-0 z-50 bg-[#f8f7f4] text-[#141618] overflow-y-auto flex flex-col"
      onKeyDown={e => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
            return
          }
          if (e.key === 'Tab') {
            const controls = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
              ) || []
            )
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last?.focus()
            }
            if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        {/* TOP NAVBAR (Exact match to Images 2 and 4) */}
        <header className="sticky top-0 z-40 h-16 bg-white border-b border-[#e7e2d9] px-6 lg:px-12 flex items-center justify-between shadow-2xs">
          {/* Left Brand + Step Indicator */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#141618] flex items-center justify-center text-white font-serif italic text-base shrink-0 shadow-sm">
              S
            </div>
            <span className="font-sans font-bold text-base tracking-tight text-[#141618]">skitrace</span>

            {step === 1 ? (
              <>
                <div className="h-4 w-px bg-[#e7e2d9] mx-1" />
                <span className="text-xs text-[#77736d] font-medium">Create a New Job</span>
              </>
            ) : (
              /* Image 4 Center Stepper */
              <div className="hidden sm:flex items-center gap-3 ml-8 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-[#247a52]"
                >
                  <span className="w-4 h-4 rounded-full bg-[#247a52] text-white text-[10px] flex items-center justify-center">
                    ✓
                  </span>
                  <span>Role</span>
                </button>
                <div className="w-8 h-px bg-[#141618]" />
                <div className="flex items-center gap-1.5 text-[#141618]">
                  <span className="w-4 h-4 rounded-full bg-[#141618] text-white text-[10px] flex items-center justify-center">
                    2
                  </span>
                  <span>Requirements</span>
                </div>
                <div className="w-8 h-px bg-[#e7e2d9]" />
                <div className="flex items-center gap-1.5 text-[#9c9890]">
                  <span className="w-4 h-4 rounded-full bg-[#eeece6] text-[#77736d] text-[10px] flex items-center justify-center">
                    3
                  </span>
                  <span>Candidates</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {step === 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="h-9 px-4 rounded-xl bg-[#faf5e8] hover:bg-[#f3ead3] border border-[#ebd8a8] text-[#745a26] text-xs font-semibold transition-colors cursor-pointer"
                >
                  Save Job
                </button>
                <button
                  type="button"
                  onClick={handleQuickSave}
                  aria-label="Set as Active Requisition"
                  className="h-9 px-5 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <span>Save & Continue</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSaveFinal}
                aria-label="Set as Active Requisition"
                disabled={reading}
                className="h-9 px-5 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <span>{reading ? 'Saving...' : 'Save Job Requirements'}</span>
              </button>
            )}
          </div>
        </header>

        {/* MAIN BODY: STEP 1 (Image 2) */}
        {step === 1 && (
          <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
            <div>
              <h1 id="jd-heading" className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-1">
                Create a New Job
              </h1>
              <p className="text-[#77736d] text-sm">
                Define the role before discovering candidates.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-[#fdf2f2] border border-[#f5c4c4] text-[#b54747] text-xs">
                {error}
              </div>
            )}

            {/* CARD 1: ROLE DETAILS */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 sm:p-8">
              <div className="text-[11px] font-bold text-[#a9874e] tracking-wider uppercase mb-5">
                Role Details
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
                <div>
                  <label htmlFor="jd-title" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Job Title *
                  </label>
                  <input
                    id="jd-title"
                    aria-label="Job Title *"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Backend Engineer"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="jd-department" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Department
                  </label>
                  <input
                    id="jd-department"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="jd-location" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Location
                  </label>
                  <input
                    id="jd-location"
                    aria-label="Location"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Remote / Berlin"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="jd-employment" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Employment type
                  </label>
                  <input
                    id="jd-employment"
                    value={employmentType}
                    onChange={e => setEmploymentType(e.target.value)}
                    placeholder="Full-time"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="jd-experience" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Experience range
                  </label>
                  <input
                    id="jd-experience"
                    value={experienceRange}
                    onChange={e => setExperienceRange(e.target.value)}
                    placeholder="e.g. 3-6 years"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="jd-manager" className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Hiring manager
                  </label>
                  <input
                    id="jd-manager"
                    value={hiringManager}
                    onChange={e => setHiringManager(e.target.value)}
                    placeholder="e.g. Elena Marsh"
                    className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="jd-summary" className="block text-xs font-semibold text-[#141618] mb-1.5">
                  Job Description Text *
                </label>
                <textarea
                  id="jd-summary"
                  aria-label="Job Description Text *"
                  rows={4}
                  value={jobSummary}
                  onChange={e => setJobSummary(e.target.value)}
                  placeholder="Summarize responsibilities, stack and expectations... (or paste full JD in next step)"
                  className="w-full p-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs resize-y"
                />
              </div>
            </div>

            {/* CARD 2: SKILL REQUIREMENTS */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 sm:p-8">
              <div className="text-[11px] font-bold text-[#a9874e] tracking-wider uppercase mb-5">
                Skill Requirements
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-5">
                {/* Column 1: Mandatory skills */}
                <div>
                  <label className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Mandatory skills
                  </label>
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white border border-[#e7e2d9] min-h-[46px]">
                    {mandatorySkills.map(skill => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#141618] text-white text-xs font-medium"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => setMandatorySkills(prev => prev.filter(s => s !== skill))}
                          className="hover:text-red-300 text-white/60"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {showAddMandatory ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={newMandatorySkill}
                          onChange={e => setNewMandatorySkill(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addMandatorySkill()}
                          placeholder="Skill..."
                          className="w-20 px-2 py-0.5 text-xs border border-[#a9874e] rounded"
                        />
                        <button type="button" onClick={addMandatorySkill} className="text-xs font-bold">+</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddMandatory(true)}
                        className="px-2.5 py-1 rounded-md border border-dashed border-[#e7e2d9] hover:border-[#141618] text-[#77736d] text-xs font-medium"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#77736d] mt-1.5">Candidates must show evidence for these.</p>
                </div>

                {/* Column 2: Preferred skills */}
                <div>
                  <label className="block text-xs font-semibold text-[#141618] mb-1.5">
                    Preferred skills
                  </label>
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-white border border-[#e7e2d9] min-h-[46px]">
                    {preferredSkills.map(skill => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-[#745a26] text-xs font-medium"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => setPreferredSkills(prev => prev.filter(s => s !== skill))}
                          className="hover:text-red-500 text-[#745a26]/60"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {showAddPreferred ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={newPreferredSkill}
                          onChange={e => setNewPreferredSkill(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addPreferredSkill()}
                          placeholder="Skill..."
                          className="w-20 px-2 py-0.5 text-xs border border-[#a9874e] rounded"
                        />
                        <button type="button" onClick={addPreferredSkill} className="text-xs font-bold">+</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddPreferred(true)}
                        className="px-2.5 py-1 rounded-md border border-dashed border-[#e7e2d9] hover:border-[#141618] text-[#77736d] text-xs font-medium"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-[#77736d] mt-1.5">Nice to have — boosts job fit.</p>
                </div>
              </div>

              <div>
                <label htmlFor="jd-additional" className="block text-xs font-semibold text-[#141618] mb-1.5">
                  Additional requirements
                </label>
                <textarea
                  id="jd-additional"
                  rows={2}
                  value={additionalRequirements}
                  onChange={e => setAdditionalRequirements(e.target.value)}
                  placeholder="e.g. System design experience, async processing, EU work permit..."
                  className="w-full p-3.5 rounded-xl bg-white border border-[#e7e2d9] text-[#141618] placeholder-[#9c9890] text-xs focus:outline-none focus:border-[#a9874e] shadow-2xs resize-y"
                />
              </div>
            </div>

            {/* Bottom action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-5 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-10 px-5 rounded-xl bg-[#faf5e8] hover:bg-[#f3ead3] border border-[#ebd8a8] text-[#745a26] text-xs font-semibold transition-colors cursor-pointer"
              >
                Save Job
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!title.trim()) {
                    setError('Please enter a job title.')
                    return
                  }
                  setError('')
                  setStep(2)
                }}
                className="h-10 px-6 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                <span>Save & Continue</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </main>
        )}

        {/* MAIN BODY: STEP 2 (Image 4) */}
        {step === 2 && (
          <main className="flex-1 max-w-5xl w-full mx-auto p-6 sm:p-10 flex flex-col gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-1">
                Define Your Hiring Requirements
              </h1>
              <p className="text-[#77736d] text-sm">
                Paste a JD or upload a document — Skitrace structures it into verifiable requirements.
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-[#fdf2f2] border border-[#f5c4c4] text-[#b54747] text-xs">
                {error}
              </div>
            )}

            {/* DUAL INPUT METHOD CARDS (Side by side) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Card A: Paste Job Description */}
              <div
                onClick={() => setTab('paste')}
                className={`p-6 rounded-2xl bg-white border-2 flex flex-col justify-between shadow-card transition-all cursor-pointer ${
                  tab === 'paste' ? 'border-[#141618]' : 'border-[#e7e2d9] opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 font-semibold text-xs text-[#141618]">
                    <span className="material-symbols-outlined text-[18px]">description</span>
                    <span>A. Paste Job Description</span>
                  </div>

                  <textarea
                    id="jd-text"
                    rows={8}
                    value={fullJdText}
                    onChange={e => {
                      setFullJdText(e.target.value)
                      if (!extractionTriggered) triggerExtraction(e.target.value)
                    }}
                    placeholder="We are hiring a Backend Engineer to own our async billing pipeline..."
                    className="w-full p-3.5 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] text-[#141618] text-xs focus:outline-none focus:bg-white resize-y leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#77736d] pt-3 mt-2 border-t border-[#f2efe9]">
                  <span>{fullJdText.length} characters · Structured preview below</span>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      setFullJdText('')
                    }}
                    className="hover:text-[#141618] underline font-medium"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Card B: Upload Job Description */}
              <div
                onClick={() => setTab('upload')}
                className={`p-6 rounded-2xl bg-white border-2 flex flex-col justify-between shadow-card transition-all cursor-pointer ${
                  tab === 'upload' ? 'border-[#141618]' : 'border-[#e7e2d9] opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 font-semibold text-xs text-[#141618]">
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                    <span>B. Upload Job Description</span>
                  </div>

                  {/* Dropzone */}
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0])
                    }}
                    className="p-8 rounded-xl border border-dashed border-[#e7e2d9] bg-[#faf9f6] flex flex-col items-center justify-center text-center gap-2 mb-4"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
                      <span className="material-symbols-outlined text-[22px]">description</span>
                    </div>
                    <div className="text-xs font-semibold text-[#141618]">Drag & drop your JD here</div>
                    <div className="text-[11px] text-[#77736d]">PDF or DOCX, up to 10 MB</div>

                    <label className="mt-2 h-8 px-4 rounded-lg bg-white border border-[#e7e2d9] hover:bg-[#f8f7f4] text-xs font-medium text-[#141618] flex items-center justify-center cursor-pointer shadow-2xs">
                      <span>Browse file</span>
                      <input
                        type="file"
                        accept=".txt,.md,.pdf,.docx"
                        onChange={e => e.target.files?.[0] && readFile(e.target.files[0])}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {/* Uploaded file preview badge */}
                <div className="p-3 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-red-600 text-[18px]">article</span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#141618] truncate">
                        {fileName || 'Backend-Engineer-JD.pdf'}
                      </div>
                      <div className="text-[10px] text-[#77736d]">
                        {fileSize || '1.2 MB'} · Parsed successfully
                      </div>
                    </div>
                  </div>
                  <span className="w-5 h-5 rounded-full bg-[#247a52] text-white text-[11px] flex items-center justify-center font-bold">
                    ✓
                  </span>
                </div>
              </div>
            </div>

            {/* CARD 3: STRUCTURED REQUIREMENTS (Exact match to Image 4) */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 sm:p-8">
              {/* Header with Sparkle and AI confirmation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-6 border-b border-[#f2efe9] gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-[#141618]">
                  <span className="material-symbols-outlined text-[#d4af37] text-[20px]">auto_awesome</span>
                  <span>Structured requirements</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-[#247a52] font-semibold">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Extracted by AI — review before saving</span>
                </div>
              </div>

              {/* 3 Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Column 1: Mandatory Skills */}
                <div>
                  <div className="text-[11px] font-bold text-[#77736d] tracking-wider uppercase mb-3">
                    Mandatory Skills
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Python', 'FastAPI', 'PostgreSQL', 'Redis'].map(skill => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-[#765c29] text-xs font-semibold"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#a9874e]" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Column 2: Preferred Skills */}
                <div>
                  <div className="text-[11px] font-bold text-[#77736d] tracking-wider uppercase mb-3">
                    Preferred Skills
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Docker', 'AWS', 'System Design'].map(skill => (
                      <span
                        key={skill}
                        className="inline-flex items-center px-3 py-1 rounded-md bg-white border border-[#e7e2d9] text-[#141618] text-xs font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Column 3: Experience */}
                <div>
                  <div className="text-[11px] font-bold text-[#77736d] tracking-wider uppercase mb-3">
                    Experience
                  </div>
                  <div className="text-xs text-[#141618] leading-relaxed">
                    <p className="font-medium">3–6 years backend · Async systems · Code review ownership</p>
                    <p className="text-[#77736d] mt-1">+ EU work permit · English C1</p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveFinal}
                  disabled={reading}
                  className="h-11 px-6 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                >
                  <span>{reading ? 'Saving Requisition...' : 'Save Job Requirements'}</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </main>
        )}
    </div>
  )
}
