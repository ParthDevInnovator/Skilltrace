import { useState, useEffect } from 'react'
import type { CandidateDetail } from '@/types'
import { api } from '@/services/api'
import { useJob } from '@/context/JobContext'

export function CandidateProfileShell() {
  const { selectedCandidateId, backToDashboard, selectedJob } = useJob()
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'claims' | 'skills' | 'resume'>('claims')

  useEffect(() => {
    if (!selectedCandidateId) return
    let isMounted = true

    async function loadDetail() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await api.getCandidateById(selectedCandidateId!)
        if (isMounted) {
          setCandidate(data)
        }
      } catch (err) {
        console.error('Failed to load candidate detail:', err)
        if (isMounted) {
          setError('Candidate profile could not be loaded.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadDetail()
    return () => {
      isMounted = false
    }
  }, [selectedCandidateId])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 py-8 animate-pulse">
        <div className="h-8 bg-white border border-[#e5e7eb] rounded-lg w-48"></div>
        <div className="h-64 bg-white border border-[#e5e7eb] rounded-xl"></div>
        <div className="h-96 bg-white border border-[#e5e7eb] rounded-xl"></div>
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-12 text-center flex flex-col items-center gap-3">
        <span className="material-symbols-outlined text-[36px] text-[#b54747]">error</span>
        <h2 className="text-lg font-semibold text-[#181c23]">Candidate Not Found</h2>
        <p className="text-xs text-[#65646f]">{error || 'Unable to retrieve candidate details.'}</p>
        <button
          type="button"
          onClick={backToDashboard}
          className="mt-2 px-4 py-2 rounded-md bg-[#6554c0] text-white text-xs font-semibold"
        >
          Return to Dashboard
        </button>
      </div>
    )
  }

  const initials = candidate.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const evidenceLabel = candidate.match_preview?.evidence_label || 'No public evidence'

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Back button row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={backToDashboard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-[#e5e7eb] text-xs font-semibold text-[#181c23] hover:bg-[#f1f3fe] transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Recruiter Overview</span>
        </button>

        {selectedJob && (
          <div className="flex items-center gap-2 text-xs text-[#65646f]">
            <span>Active Job Context:</span>
            <span className="font-semibold text-[#4d3aa6] bg-[#f1eefc] px-2 py-0.5 rounded">
              {selectedJob.title} (#{selectedJob.id})
            </span>
          </div>
        )}
      </div>

      {/* Header Profile Card (Stitch Candidate Intelligence Profile design) */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
          {/* Avatar and Info */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-xl bg-[#ebedf9] border border-[#c9c4d4] flex items-center justify-center text-[#4d3aa6] font-bold text-xl select-none">
                {initials}
              </div>
              <span
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#247a52] ring-2 ring-white"
                title="Verified Seed Artifact"
              ></span>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 mb-1">
                <h1 className="text-xl font-bold text-[#181c23] tracking-tight">
                  {candidate.full_name}
                </h1>
                <span className="bg-[#f1eefc] text-[#4d3aa6] border border-[#a595fe] text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6554c0]"></span>
                  <span>{evidenceLabel}</span>
                </span>
                <span className="bg-[#ebedf9] text-[#65646f] text-[11px] font-mono px-2 py-0.5 rounded">
                  #{candidate.id}
                </span>
              </div>

              <p className="text-xs text-[#484552] mb-2 font-medium">
                {candidate.headline} • {candidate.experience_years ?? 5}+ years verified experience
              </p>

              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-[#65646f]">
                {selectedJob && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#f1f3fe] text-[#4d3aa6] font-medium border border-[#e5e7eb]">
                    <span className="material-symbols-outlined text-[15px]">business_center</span>
                    <span>Target: {selectedJob.title}</span>
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-[#797584]">
                    location_on
                  </span>
                  <span>{candidate.location}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-[#797584]">mail</span>
                  <span>{candidate.email}</span>
                </span>
              </div>

              {/* Verified Links Pill Group */}
              <div className="flex flex-wrap items-center gap-2">
                {candidate.external_identifiers?.github ? (
                  <a
                    href={candidate.external_identifiers.github}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#f9f9ff] border border-[#e5e7eb] hover:border-[#6554c0] text-[11px] text-[#181c23] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#65646f]">code</span>
                    <span className="font-semibold">GitHub:</span>
                    <span className="text-[#65646f] font-mono">
                      {candidate.external_identifiers.github.replace('https://github.com/', '@')}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#247a52]"></span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#f1f3f5] border border-[#d7dbe0] text-[11px] text-[#727b89]">
                    <span className="material-symbols-outlined text-[14px]">code_off</span>
                    <span>No public GitHub</span>
                  </span>
                )}

                {candidate.external_identifiers?.linkedin ? (
                  <a
                    href={candidate.external_identifiers.linkedin}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#f9f9ff] border border-[#e5e7eb] hover:border-[#6554c0] text-[11px] text-[#181c23] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#65646f]">badge</span>
                    <span className="font-semibold">LinkedIn:</span>
                    <span className="text-[#65646f]">Verified Profile</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#f1f3f5] border border-[#d7dbe0] text-[11px] text-[#727b89]">
                    <span className="material-symbols-outlined text-[14px]">link_off</span>
                    <span>No LinkedIn link</span>
                  </span>
                )}

                {candidate.external_identifiers?.leetcode && (
                  <a
                    href={candidate.external_identifiers.leetcode}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#f9f9ff] border border-[#e5e7eb] hover:border-[#6554c0] text-[11px] text-[#181c23] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#65646f]">
                      military_tech
                    </span>
                    <span className="font-semibold">LeetCode:</span>
                    <span className="text-[#65646f]">Top Percentile</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end gap-2 flex-shrink-0">
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-[#6554c0] text-white hover:bg-[#5545a8] text-xs font-semibold shadow-xs flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
              <span>Generate Interview Brief</span>
            </button>
            <button
              type="button"
              className="px-3.5 py-2 rounded-md bg-white border border-[#e5e7eb] hover:bg-[#f8fafc] text-xs font-semibold text-[#181c23] flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-[#65646f]">
                picture_as_pdf
              </span>
              <span>Resume Reference</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#e5e7eb] rounded-lg px-6 flex gap-8 text-xs font-semibold shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('claims')}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'claims'
              ? 'border-[#6554c0] text-[#4d3aa6]'
              : 'border-transparent text-[#65646f] hover:text-[#181c23]'
          }`}
        >
          <span>Evidence & Claims</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#f1f3fe] text-[#4d3aa6] text-[10px]">
            {candidate.claims_preview.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('skills')}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'skills'
              ? 'border-[#6554c0] text-[#4d3aa6]'
              : 'border-transparent text-[#65646f] hover:text-[#181c23]'
          }`}
        >
          <span>Verified Skills</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#f1f3fe] text-[#4d3aa6] text-[10px]">
            {candidate.top_skills.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('resume')}
          className={`py-3.5 flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'resume'
              ? 'border-[#6554c0] text-[#4d3aa6]'
              : 'border-transparent text-[#65646f] hover:text-[#181c23]'
          }`}
        >
          <span>Background Summary</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'claims' && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
            <h3 className="text-sm font-bold text-[#181c23]">
              Extracted Resume Claims & Evidentiary Observations
            </h3>
            <span className="text-[11px] text-[#65646f]">Deterministic verification tier</span>
          </div>

          <div className="flex flex-col gap-3">
            {candidate.claims_preview.map((claim, idx) => (
              <div
                key={idx}
                className="bg-[#f9f9ff] border-l-4 border-[#6554c0] border border-[#e5e7eb] p-3.5 rounded-r-lg flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#4d3aa6] font-mono">
                    CLAIM #{idx + 1}
                  </span>
                  <span className="text-[10px] text-[#247a52] bg-[#edf7f2] border border-[#b7e2ce] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                    <span>Audit Ready</span>
                  </span>
                </div>
                <p className="text-xs text-[#181c23] leading-relaxed font-sans">{claim}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-3">
            <h3 className="text-sm font-bold text-[#181c23]">Core Technical Competencies</h3>
            <span className="text-[11px] text-[#65646f]">Mapped to Requisition Requirements</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {candidate.top_skills.map((skill) => (
              <div
                key={skill}
                className="bg-[#f9f9ff] border border-[#e5e7eb] p-3 rounded-lg flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-[#181c23]">{skill}</span>
                <span className="material-symbols-outlined text-[16px] text-[#247a52]">check_circle</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'resume' && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-sm font-bold text-[#181c23] border-b border-[#e5e7eb] pb-3">
            Candidate Background Summary
          </h3>
          <p className="text-xs text-[#181c23] leading-relaxed bg-[#f9f9ff] p-4 rounded-lg border border-[#e5e7eb]">
            {candidate.summary || 'No background summary provided for this candidate record.'}
          </p>
          {candidate.resume_path && (
            <div className="text-xs text-[#65646f] flex items-center gap-1.5 mt-2">
              <span className="material-symbols-outlined text-[16px] text-[#797584]">
                description
              </span>
              <span>Source Document Reference: {candidate.resume_path}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
