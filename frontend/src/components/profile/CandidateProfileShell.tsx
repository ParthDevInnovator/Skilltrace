import { useState, useEffect } from 'react'
import { IntelligenceOverview } from './IntelligenceOverview'
import type { CandidateDetail } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { JDMatchTab } from './JDMatchTab'
import { ResumeViewer } from './ResumeViewer'
import { BriefQuestionsTab } from './BriefQuestionsTab'
import { ChatDrawer } from '@/components/agent/ChatDrawer'
import { EvidenceCard } from '@/components/evidence/EvidenceCard'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
import { EvidenceBar } from '@/components/evidence/EvidenceBar'
import { labelForScore, provenanceSummary } from '@/types/context'
import { useAuth } from '@/context/AuthContext'

export function CandidateProfileShell() {
  const { hasRole } = useAuth()
  const { selectedCandidateId, selectedJob, backToDashboard, setActiveView } = useJob()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'background' | 'claims' | 'match' | 'brief' | 'resume' | 'evidence'>('overview')
  const [chatOpen, setChatOpen] = useState(false)
  const [exportRequest, setExportRequest] = useState(0)

  const { context, phase, retry } = useCandidateContext(selectedCandidateId, hasRole('recruiter'))

  useEffect(() => {
    if (!selectedCandidateId) return
    let cancelled = false
    api
      .getCandidateById(selectedCandidateId)
      .then(result => {
        if (!cancelled) setCandidate(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [selectedCandidateId, detailAttempt])

  if (failed) {
    return (
      <section className="p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card text-center max-w-lg mx-auto my-12" role="alert">
        <h1 className="text-xl font-bold text-[#141618] mb-2">Candidate Not Found</h1>
        <p className="text-sm text-[#59616b] mb-6">Candidate profile could not be loaded.</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setDetailAttempt(v => v + 1)
            }}
            className="h-10 px-4 rounded-xl border border-[#e7e2d9] bg-white text-xs font-semibold cursor-pointer"
          >
            Retry profile
          </button>
          <button
            type="button"
            onClick={backToDashboard}
            className="h-10 px-5 rounded-xl bg-[#141618] text-white text-xs font-semibold cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </section>
    )
  }

  if (!candidate) return <p role="status" className="panel">Loading candidate profile…</p>
  const displayCandidate = candidate

  const jobTitle = selectedJob?.title || 'No job selected'

  return (
    <div className="candidate-intelligence flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Context Feedback (Alert / Loading / Polling) */}
      {hasRole('recruiter') ? <ContextFeedback phase={phase} retry={retry} /> : <p>Raw evidence context is restricted to recruiters. Interview questions remain available.</p>}

      {/* Breadcrumb Navigation + Back button (Exact match to Image 1 + Preserving Navigation) */}
      <div className="flex items-center justify-between pt-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#59616b]">
          <button
            type="button"
            onClick={() => setActiveView('jobs')}
            className="hover:text-[#141618] transition-colors cursor-pointer"
          >
            Jobs
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => setActiveView('job-detail')}
            className="hover:text-[#141618] transition-colors cursor-pointer"
          >
            {jobTitle}
          </button>
          <span>/</span>
          <span className="text-[#141618] font-semibold">{displayCandidate.full_name}</span>
        </nav>

        <button
          type="button"
          onClick={backToDashboard}
          className="secondary-button text-xs text-[#59616b] hover:text-[#141618] transition-colors cursor-pointer"
        >
          Back to Recruiter Overview
        </button>
      </div>

      {/* TOP CANDIDATE HERO CARD (Exact match to Image 1) */}
      <header className="p-6 sm:p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Avatar, Name, Identity Pill, Social proof links */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 min-w-0">
          <div className="w-20 h-20 rounded-full bg-[#ebd8a8] border-2 border-[#a9874e]/30 flex items-center justify-center text-[#745723] text-xl font-bold shrink-0 shadow-sm">
            {displayCandidate.full_name
              .split(' ')
              .map(n => n[0])
              .join('')}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-serif text-[#141618] font-semibold tracking-tight truncate">
                {displayCandidate.full_name}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-xs font-semibold">
                Identity: unassessed
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#59616b] mb-3">
              {displayCandidate.headline} · {displayCandidate.location || 'Location unknown'} ·{' '}
              {displayCandidate.experience_years != null ? `${displayCandidate.experience_years} yrs reported` : 'Experience unknown'}
            </p>

            {/* Platform proof badges */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={displayCandidate.external_identifiers?.github || undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f8f7f4] hover:bg-[#eeece6] text-[#141618] text-xs font-medium border border-[#e7e2d9] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">code</span>
                <span>GitHub</span>
              </a>

              <a
                href={displayCandidate.external_identifiers?.linkedin || undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f8f7f4] hover:bg-[#eeece6] text-[#141618] text-xs font-medium border border-[#e7e2d9] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">domain</span>
                <span>LinkedIn</span>
              </a>

              <a
                href={displayCandidate.external_identifiers?.leetcode || undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f8f7f4] hover:bg-[#eeece6] text-[#141618] text-xs font-medium border border-[#e7e2d9] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">terminal</span>
                <span>LeetCode</span>
              </a>
            </div>
          </div>
        </div>

        {/* Right: Compare, Export brief & Big Score Badges */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveView('comparison')}
              className="h-10 px-4 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">compare_arrows</span>
              <span>Compare</span>
            </button>

            <button
              type="button"
              disabled={!hasRole('recruiter')}
              onClick={() => {
                setActiveTab('brief')
                setExportRequest(v => v + 1)
              }}
              className="h-10 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">download</span>
              <span>Export brief</span>
            </button>
          </div>

          {/* Score Badges (Black & Champagne gold cards) */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setActiveTab('match')} disabled={!selectedJob || !hasRole('recruiter')} aria-label="View job fit assessment" className="profile-score-card profile-score-fit">
              <span className="text-sm font-bold">See JD Match</span>
              <span className="text-[10px] text-white/70 uppercase tracking-wider font-semibold mt-1">
                Job Fit
              </span>
            </button>

            <button type="button" onClick={() => setActiveTab('evidence')} disabled={!hasRole('recruiter')} aria-label="View candidate evidence" className="profile-score-card profile-score-evidence">
              <span className="text-sm font-bold">{context?.evidence_label ?? 'Pending'}</span>
              <span className="text-[10px] text-[#745723]/80 uppercase tracking-wider font-semibold mt-1">
                Evidence
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-tab navigation */}
      <nav aria-label="Candidate profile sections" className="flex items-center gap-2 border-b border-[#e7e2d9] pb-px overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          aria-pressed={activeTab === 'overview'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Dossier Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('claims')}
          aria-pressed={activeTab === 'claims'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'claims'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Evidence & Claims
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          aria-pressed={activeTab === 'skills'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'skills'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Reported Skills
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('background')}
          aria-pressed={activeTab === 'background'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'background'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Background Summary
        </button>

        {selectedJob && hasRole('recruiter') && (
          <button
            type="button"
            onClick={() => setActiveTab('match')}
            aria-pressed={activeTab === 'match'}
            className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'match'
                ? 'border-[#141618] text-[#141618]'
                : 'border-transparent text-[#59616b] hover:text-[#141618]'
            }`}
          >
            JD Match
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('brief')}
          aria-pressed={activeTab === 'brief'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'brief'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Brief & Questions
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('resume')}
          aria-pressed={activeTab === 'resume'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'resume'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Resume Reference
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('evidence')}
          aria-pressed={activeTab === 'evidence'}
          className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'evidence'
              ? 'border-[#141618] text-[#141618]'
              : 'border-transparent text-[#59616b] hover:text-[#141618]'
          }`}
        >
          Evidence Observations ({context?.evidence_records.length ?? 0})
        </button>
      </nav>

      {/* TAB 1: DOSSIER OVERVIEW (Exact match to Image 1) */}
      {activeTab === 'overview' && <IntelligenceOverview candidate={displayCandidate} context={context} job={selectedJob} inspectClaims={() => setActiveTab('claims')} />}

      {/* TAB: CLAIMS & EVIDENCE */}
      {activeTab === 'claims' && (
        <section className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card space-y-4">
            <h2 className="text-lg font-bold text-[#141618]">Reported Resume Claims</h2>
            {context && (
              <>
                <p className="text-xs text-[#59616b] italic mb-3">
                  {provenanceSummary(context.evidence_records ?? [])}
                </p>
                {!context.claims.length && (
                  <p className="text-xs text-[#59616b]">
                    No claims matched the extraction rules. Inspect the resume for additional reported experience.
                  </p>
                )}
                <div className="space-y-3">
                  {context.claims.map(claim => (
                    <article key={claim.id} className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9]">
                      <div className="flex items-center justify-between mb-1">
                        <strong className="text-xs font-bold text-[#141618]">
                          {claim.section}{claim.skill ? ` - ${claim.skill}` : ''}
                        </strong>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#e7e2d9] text-[#59616b]">
                          {claim.verification_state}
                        </span>
                      </div>
                      <p className="text-xs text-[#141618] mb-1">{claim.claim_text}</p>
                      <small className="text-[10px] text-[#59616b]">{claim.provenance}</small>
                    </article>
                  ))}
                </div>

                <h2 className="text-lg font-bold text-[#141618] mt-6 pt-6 border-t border-[#e7e2d9]">
                  Evidence observations
                </h2>
                {!context.evidence_records.length && (
                  <p className="text-xs text-[#59616b]">
                    No public evidence available. Absence of public signals is not a finding about competence.
                  </p>
                )}
                <div className="space-y-3">
                  {context.evidence_records.map(record => (
                    <EvidenceCard key={record.id} record={record} />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* TAB: REPORTED SKILLS */}
      {activeTab === 'skills' && (
        <section className="p-6 sm:p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#141618] mb-1">Core Technical Competencies</h2>
            <p className="text-xs text-[#59616b]">
              Reported skills and associated observations; evidence tiers do not certify proficiency.
            </p>
          </div>
          <ContextFeedback phase={phase} retry={retry} />
          <div className="flex flex-wrap gap-2">
            {displayCandidate.top_skills.map(skill => (
              <span key={skill} className="px-3 py-1 rounded-lg bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-xs font-medium">
                {skill}
              </span>
            ))}
          </div>
          {context && (
            <div className="space-y-3 pt-4 border-t border-[#e7e2d9]">
              {[...new Map([...(context.evidence_records ?? []).map(r => r.skill), ...displayCandidate.top_skills].map(s => [s.toLowerCase(), s])).values()].map(skill => {
                const supporting = (context.evidence_records ?? []).filter(r => r.skill.toLowerCase() === skill.toLowerCase())
                const score = Math.round(supporting.reduce((tot, r) => tot + r.computed_weight, 0) * 1e9) / 1e9
                return (
                  <div key={skill} className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-xs font-bold text-[#141618]">{skill}</strong>
                      <span className="text-xs text-[#59616b]">{supporting.length} observations · {score.toFixed(1)} points</span>
                    </div>
                    <EvidenceBar score={score} label={labelForScore(score)} />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB: BACKGROUND SUMMARY */}
      {activeTab === 'background' && (
        <section className="p-6 sm:p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <h2 className="text-xl font-bold text-[#141618] mb-3">Candidate Background Summary</h2>
          <p className="text-sm text-[#141618] leading-relaxed">
            {displayCandidate.summary || 'No background summary provided for this candidate record.'}
          </p>
        </section>
      )}

      {/* TAB 2: JD MATCH */}
      {activeTab === 'match' && selectedJob && (
        <section className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <JDMatchTab
            key={`${displayCandidate.id}-${selectedJob.id}`}
            candidateId={displayCandidate.id}
            jobId={selectedJob.id}
            context={context}
          />
        </section>
      )}

      {/* TAB 3: BRIEF & QUESTIONS */}
      {activeTab === 'brief' && (
        <section className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <BriefQuestionsTab
            candidateId={displayCandidate.id}
            jobId={selectedJob?.id}
            exportRequest={exportRequest}
          />
        </section>
      )}

      {/* TAB 4: RAW RESUME */}
      {activeTab === 'resume' && (
        <section className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <ResumeViewer key={displayCandidate.id} candidateId={displayCandidate.id} />
        </section>
      )}

      {/* TAB 5: RAW EVIDENCE */}
      {activeTab === 'evidence' && (
        <section className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card space-y-4">
          <h2 className="text-lg font-bold text-[#141618]">Evidence Observations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {context?.evidence_records.map(record => (
              <EvidenceCard key={record.id} record={record} />
            ))}
          </div>
        </section>
      )}

      {/* AI Assistant Chat Drawer */}
      {chatOpen && (
        <ChatDrawer
          onClose={() => setChatOpen(false)}
          initialMessage={`Tell me about ${displayCandidate.full_name}.`}
        />
      )}
    </div>
  )
}
