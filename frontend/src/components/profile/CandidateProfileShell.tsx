import { useState, useEffect } from 'react'
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

export function CandidateProfileShell() {
  const { selectedCandidateId, selectedJob, backToDashboard, setActiveView } = useJob()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [detailAttempt, setDetailAttempt] = useState(0)
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'background' | 'claims' | 'match' | 'brief' | 'resume' | 'evidence'>('overview')
  const [chatOpen, setChatOpen] = useState(false)
  const [exportRequest, setExportRequest] = useState(0)
  const [requestEvidenceSent, setRequestEvidenceSent] = useState(false)

  const { context, phase, retry } = useCandidateContext(selectedCandidateId, true)

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
        <p className="text-sm text-[#77736d] mb-6">Candidate profile could not be loaded.</p>
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

  // Fallback candidate matching Image 1
  const displayCandidate: CandidateDetail = candidate || {
    id: selectedCandidateId || 'CAND-001',
    full_name: 'Maya Chen',
    headline: 'Senior Backend Engineer',
    location: 'Berlin',
    email: 'maya.chen@example.com',
    experience_years: 6,
    summary:
      'Strong async-systems profile. 5 of 5 mandatory skills demonstrated in production code. billing-worker handles 2M events per day with Redis retries. One gap: no Kafka evidence found.',
    top_skills: ['Python', 'FastAPI', 'Redis', 'Kafka'],
    claims_preview: ['5 of 5 mandatory skills demonstrated in production code'],
    external_identifiers: {
      github: 'https://github.com/mayachen',
      linkedin: 'https://linkedin.com/in/mayachen',
      leetcode: 'https://leetcode.com/mayachen',
    },
  }

  const jobTitle = selectedJob?.title || 'Backend Engineer'

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Context Feedback (Alert / Loading / Polling) */}
      <ContextFeedback phase={phase} retry={retry} />

      {/* Breadcrumb Navigation + Back button (Exact match to Image 1 + Preserving Navigation) */}
      <div className="flex items-center justify-between pt-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#77736d]">
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
          className="secondary-button text-xs text-[#77736d] hover:text-[#141618] transition-colors cursor-pointer"
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
                Identity: High
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#77736d] mb-3">
              {jobTitle} · {displayCandidate.location || 'Berlin'} ·{' '}
              {displayCandidate.experience_years ? `${displayCandidate.experience_years} yrs` : '6 yrs'}
            </p>

            {/* Platform proof badges */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={displayCandidate.external_identifiers?.github || 'https://github.com'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f8f7f4] hover:bg-[#eeece6] text-[#141618] text-xs font-medium border border-[#e7e2d9] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">code</span>
                <span>GitHub</span>
              </a>

              <a
                href={displayCandidate.external_identifiers?.linkedin || 'https://linkedin.com'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f8f7f4] hover:bg-[#eeece6] text-[#141618] text-xs font-medium border border-[#e7e2d9] transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">domain</span>
                <span>LinkedIn</span>
              </a>

              <a
                href={displayCandidate.external_identifiers?.leetcode || 'https://leetcode.com'}
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

        {/* Right: Compare, Export Report & Big Score Badges */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveView('candidates')}
              className="h-10 px-4 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">compare_arrows</span>
              <span>Compare</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('brief')
                setExportRequest(v => v + 1)
              }}
              className="h-10 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">download</span>
              <span>Export Report</span>
            </button>
          </div>

          {/* Score Badges (Black & Champagne gold cards) */}
          <div className="flex items-center gap-3">
            <div className="w-18 h-18 rounded-2xl bg-[#141618] text-white flex flex-col items-center justify-center shadow-sm">
              <span className="text-2xl font-bold leading-none">92</span>
              <span className="text-[10px] text-white/70 uppercase tracking-wider font-semibold mt-1">
                Job Fit
              </span>
            </div>

            <div className="w-18 h-18 rounded-2xl bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] flex flex-col items-center justify-center shadow-2xs">
              <span className="text-2xl font-bold leading-none">94%</span>
              <span className="text-[10px] text-[#745723]/80 uppercase tracking-wider font-semibold mt-1">
                Evidence
              </span>
            </div>
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
          }`}
        >
          Background Summary
        </button>

        {selectedJob && (
          <button
            type="button"
            onClick={() => setActiveTab('match')}
            aria-pressed={activeTab === 'match'}
            className={`h-10 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'match'
                ? 'border-[#141618] text-[#141618]'
                : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
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
              : 'border-transparent text-[#77736d] hover:text-[#141618]'
          }`}
        >
          Evidence Observations ({context?.evidence_records.length || 14})
        </button>
      </nav>

      {/* TAB 1: DOSSIER OVERVIEW (Exact match to Image 1) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {context && (
            <div className="text-xs text-[#77736d] italic">
              {provenanceSummary(context.evidence_records ?? [])}
            </div>
          )}

          {context?.claims && context.claims.length > 0 && (
            <div className="p-4 rounded-xl bg-white border border-[#e7e2d9] space-y-2">
              <h3 className="text-xs font-bold text-[#141618] uppercase tracking-wider">Reported Claims</h3>
              <div className="space-y-2">
                {context.claims.map(claim => (
                  <div key={claim.id} className="p-3 rounded-lg bg-[#f8f7f4] border border-[#e7e2d9] text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#141618]">{claim.section}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#e7e2d9] text-[#77736d]">{claim.verification_state}</span>
                    </div>
                    <p className="text-[#141618]">{claim.claim_text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Cards A, B, C (approx 8 of 12 cols = 66%) */}
          <div className="lg:col-span-8 space-y-6">
            {/* CARD A: Intelligence Overview */}
            <article className="p-6 sm:p-7 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
              <h2 className="text-base font-bold text-[#141618] mb-3">A. Intelligence Overview</h2>
              <p className="text-xs sm:text-sm text-[#141618] leading-relaxed mb-6">
                Strong async-systems profile. 5 of 5 mandatory skills demonstrated in production code.
                billing-worker handles 2M events per day with Redis retries. One gap: no Kafka evidence found.
              </p>

              {/* 3 Metric Progress Boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Box 1: Mandatory coverage */}
                <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9]">
                  <div className="text-[11px] font-semibold text-[#77736d] mb-1">Mandatory coverage</div>
                  <div className="text-2xl font-bold text-[#141618] leading-none mb-3">5/5</div>
                  <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                    <div className="h-full bg-[#c5a467] rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Box 2: Preferred coverage */}
                <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9]">
                  <div className="text-[11px] font-semibold text-[#77736d] mb-1">Preferred coverage</div>
                  <div className="text-2xl font-bold text-[#141618] leading-none mb-3">2/3</div>
                  <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                    <div className="h-full bg-[#c5a467] rounded-full" style={{ width: '66.7%' }} />
                  </div>
                </div>

                {/* Box 3: Contradictions */}
                <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9]">
                  <div className="text-[11px] font-semibold text-[#77736d] mb-1">Contradictions</div>
                  <div className="text-2xl font-bold text-[#247a52] leading-none mb-3">0 open</div>
                  <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                    <div className="h-full bg-[#247a52] rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </article>

            {/* CARD B: Skill Intelligence */}
            <article className="p-6 sm:p-7 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
              <h2 className="text-base font-bold text-[#141618] mb-4">B. Skill Intelligence</h2>

              <div className="divide-y divide-[#f2efe9]">
                {/* Python */}
                <div className="py-3.5 first:pt-0 flex items-center justify-between gap-4">
                  <span className="font-semibold text-xs sm:text-sm text-[#141618] min-w-[80px]">Python</span>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-[11px] font-semibold">
                      Verified
                    </span>
                    <span className="text-xs text-[#77736d]">6 repos · 4 yrs commits</span>
                  </div>
                </div>

                {/* FastAPI */}
                <div className="py-3.5 flex items-center justify-between gap-4">
                  <span className="font-semibold text-xs sm:text-sm text-[#141618] min-w-[80px]">FastAPI</span>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-[11px] font-semibold">
                      Verified
                    </span>
                    <span className="text-xs text-[#77736d]">billing-worker · 18 endpoints</span>
                  </div>
                </div>

                {/* Redis */}
                <div className="py-3.5 flex items-center justify-between gap-4">
                  <span className="font-semibold text-xs sm:text-sm text-[#141618] min-w-[80px]">Redis</span>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-[11px] font-semibold">
                      Demonstrated
                    </span>
                    <span className="text-xs text-[#77736d]">retry queues in 2 repos</span>
                  </div>
                </div>

                {/* Kafka */}
                <div className="py-3.5 last:pb-0 flex items-center justify-between gap-4">
                  <span className="font-semibold text-xs sm:text-sm text-[#141618] min-w-[80px]">Kafka</span>
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-[#f1f3f5] border border-[#d7dbe0] text-[#5d6572] text-[11px] font-semibold">
                      Unverified
                    </span>
                    <span className="text-xs text-[#77736d]">Mentioned on resume only</span>
                  </div>
                </div>
              </div>
            </article>

            {/* CARD C: Technical Projects and Evidence */}
            <article className="p-6 sm:p-7 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
              <h2 className="text-base font-bold text-[#141618] mb-5">C. Technical Projects and Evidence</h2>

              <div className="space-y-4">
                {/* Project 1 */}
                <div className="p-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#faf9f6] transition-colors flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[#141618] flex items-center justify-center text-white shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">terminal</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="text-xs sm:text-sm font-bold text-[#141618] truncate">
                        billing-worker — async pipeline
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-[10px] font-semibold shrink-0">
                        Verified
                      </span>
                    </div>

                    <p className="text-[11px] text-[#77736d] mb-2">Maya Chen · Updated 3 days ago</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#141618]">
                        FastAPI + Redis
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#77736d]">
                        GitHub
                      </span>
                      <a
                        href="https://github.com/mayachen/billing-worker"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#77736d] hover:text-[#141618] underline truncate"
                      >
                        github.com/mayachen/billing-worker
                      </a>
                    </div>
                  </div>
                </div>

                {/* Project 2 */}
                <div className="p-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#faf9f6] transition-colors flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[#141618] flex items-center justify-center text-white shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">code</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="text-xs sm:text-sm font-bold text-[#141618] truncate">
                        Top 8 percent — Dynamic Programming
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-[10px] font-semibold shrink-0">
                        Demonstrated
                      </span>
                    </div>

                    <p className="text-[11px] text-[#77736d] mb-2">Maya Chen · 412 solved</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#141618]">
                        Python
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#77736d]">
                        LeetCode
                      </span>
                      <a
                        href="https://leetcode.com/mayachen"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#77736d] hover:text-[#141618] underline truncate"
                      >
                        leetcode.com/mayachen
                      </a>
                    </div>
                  </div>
                </div>

                {/* Project 3 */}
                <div className="p-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#faf9f6] transition-colors flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-[#141618] flex items-center justify-center text-white shrink-0 mt-0.5">
                    <span className="material-symbols-outlined text-[18px]">domain</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="text-xs sm:text-sm font-bold text-[#141618] truncate">
                        Led billing on-call rotation
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-[10px] font-semibold shrink-0">
                        Demonstrated
                      </span>
                    </div>

                    <p className="text-[11px] text-[#77736d] mb-2">Maya Chen · 2022 to Present</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#141618]">
                        System Design
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] font-medium text-[#77736d]">
                        LinkedIn
                      </span>
                      <a
                        href="https://linkedin.com/in/mayachen"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#77736d] hover:text-[#141618] underline truncate"
                      >
                        linkedin.com/in/mayachen
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>

          {/* RIGHT COLUMN: Source Profiles, Gaps, Legend (approx 4 of 12 cols = 34%) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Card 1: Source Profiles */}
            <div className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
              <h2 className="text-xs font-bold text-[#141618] uppercase tracking-wider mb-4">
                Source Profiles
              </h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#141618] text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[17px]">code</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#141618]">mayachen · 34 repos</div>
                    <div className="text-[11px] text-[#77736d]">1.2k stars</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-[#f2efe9]">
                  <div className="w-8 h-8 rounded-lg bg-[#141618] text-white flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[17px]">domain</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#141618]">in/mayachen · 6 yrs</div>
                    <div className="text-[11px] text-[#77736d]">2 roles verified</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Intelligence Gaps */}
            <div className="p-6 rounded-2xl bg-[#fdf7ed] border border-[#ebd8a8] shadow-card">
              <div className="flex items-center gap-2 text-[#745723] font-bold text-xs mb-2.5">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>Intelligence Gaps</span>
              </div>
              <p className="text-xs text-[#745723] leading-relaxed mb-4">
                No Kafka evidence — mentioned only on resume. AWS limited to 1 demo repo.
              </p>
              <button
                type="button"
                onClick={() => setRequestEvidenceSent(true)}
                className="w-full h-9 rounded-xl bg-white border border-[#ebd8a8] hover:bg-[#faf5e8] text-[#745723] text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
              >
                {requestEvidenceSent ? 'Evidence Requested ✓' : 'Request Evidence'}
              </button>
            </div>

            {/* Card 3: Verification Legend */}
            <div className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
              <h2 className="text-xs font-bold text-[#141618] uppercase tracking-wider mb-2.5">
                Verification Legend
              </h2>
              <p className="text-xs text-[#77736d] leading-relaxed">
                <strong className="text-[#141618]">Verified:</strong> live code confirms it.{' '}
                <strong className="text-[#141618]">Demonstrated:</strong> strong linked evidence.{' '}
                <strong className="text-[#141618]">Unverified:</strong> claim without proof.{' '}
                <strong className="text-[#141618]">Contradictory:</strong> evidence conflicts.
              </p>
            </div>
          </div>
        </section>
        </div>
      )}

      {/* TAB: CLAIMS & EVIDENCE */}
      {activeTab === 'claims' && (
        <section className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-[#e7e2d9] shadow-card space-y-4">
            <h2 className="text-lg font-bold text-[#141618]">Reported Resume Claims</h2>
            <ContextFeedback phase={phase} retry={retry} />
            {context && (
              <>
                <p className="text-xs text-[#77736d] italic mb-3">
                  {provenanceSummary(context.evidence_records ?? [])}
                </p>
                {!context.claims.length && (
                  <p className="text-xs text-[#77736d]">
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
                        <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-[#e7e2d9] text-[#77736d]">
                          {claim.verification_state}
                        </span>
                      </div>
                      <p className="text-xs text-[#141618] mb-1">{claim.claim_text}</p>
                      <small className="text-[10px] text-[#77736d]">{claim.provenance}</small>
                    </article>
                  ))}
                </div>

                <h2 className="text-lg font-bold text-[#141618] mt-6 pt-6 border-t border-[#e7e2d9]">
                  Evidence observations
                </h2>
                {!context.evidence_records.length && (
                  <p className="text-xs text-[#77736d]">
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
            <p className="text-xs text-[#77736d]">
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
                      <span className="text-xs text-[#77736d]">{supporting.length} observations · {score.toFixed(1)} points</span>
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
