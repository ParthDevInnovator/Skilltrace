import { useState } from 'react'
import { useJob } from '@/context/JobContext'
import type { Job } from '@/types'
import { CandidateComparisonView } from './CandidateComparisonView'

export function JobDetailWorkspace() {
  const {
    selectedJob,
    jobs,
    setActiveView,
    openCandidateDetail,
    jobWorkspaceTab,
    setJobWorkspaceTab,
  } = useJob()

  const currentJob: Job = selectedJob || jobs[0] || {
    id: 'JOB-BE-01',
    title: 'Backend Engineer',
    department: 'Engineering',
    location: 'Remote · Full-time',
    description_raw:
      'Own our async billing pipeline serving 2M events/day. Python + FastAPI + PostgreSQL + Redis. You lead system design, code review and on-call for the billing domain. 3–6 years backend experience required.',
    requirements: [],
  }

  const [activeSkillFilter, setActiveSkillFilter] = useState<'All' | 'Python' | 'FastAPI' | 'Redis'>('Python')
  const [activeEvidenceFilter, setActiveEvidenceFilter] = useState<'All' | '70%+'>('70%+')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Analyzed' | 'Needs Review' | 'Processing'>('All')

  // 5 high-fidelity candidates matching Image 5
  const candidatesData = [
    {
      id: 'CAND-001',
      name: 'Maya Chen',
      role: 'Backend · 6 yrs',
      avatar: 'MC',
      skills: ['Python', 'FastAPI'],
      extraSkillsCount: 3,
      jobFit: 92,
      mandatoryCoverage: '5/5',
      evidenceScore: 94,
      identityTier: 'High',
      identityStatus: 'Analyzed',
    },
    {
      id: 'CAND-002',
      name: 'Jonas Weber',
      role: 'Backend · 5 yrs',
      avatar: 'JW',
      skills: ['Python', 'PostgreSQL'],
      extraSkillsCount: 2,
      jobFit: 88,
      mandatoryCoverage: '5/5',
      evidenceScore: 87,
      identityTier: 'High',
      identityStatus: 'Analyzed',
    },
    {
      id: 'CAND-003',
      name: 'Priya Nair',
      role: 'Full Stack · 4 yrs',
      avatar: 'PN',
      skills: ['FastAPI', 'React'],
      extraSkillsCount: 2,
      jobFit: 84,
      mandatoryCoverage: '4/5',
      evidenceScore: 81,
      identityTier: 'Medium',
      identityStatus: 'Analyzed',
    },
    {
      id: 'CAND-004',
      name: 'Sam Okonkwo',
      role: 'Backend · 7 yrs',
      avatar: 'SO',
      skills: ['Django', 'Redis'],
      extraSkillsCount: 1,
      jobFit: 71,
      mandatoryCoverage: '3/5',
      evidenceScore: 64,
      identityTier: 'Medium',
      identityStatus: 'Needs Review',
    },
    {
      id: 'CAND-005',
      name: 'Lina Haddad',
      role: 'Backend · 3 yrs',
      avatar: 'LH',
      skills: ['Python', 'Flask'],
      extraSkillsCount: 1,
      jobFit: 66,
      mandatoryCoverage: '3/5',
      evidenceScore: 58,
      identityTier: 'Low',
      identityStatus: 'Processing',
    },
  ]

  const filteredCandidates = candidatesData.filter(c => {
    if (activeSkillFilter !== 'All' && !c.skills.includes(activeSkillFilter)) return false
    if (activeEvidenceFilter === '70%+' && c.evidenceScore < 70) return false
    if (statusFilter !== 'All' && c.identityStatus !== statusFilter) return false
    return true
  })

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-16">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#77736d] pt-1">
        <button
          type="button"
          onClick={() => setActiveView('jobs')}
          className="hover:text-[#141618] transition-colors cursor-pointer"
        >
          Jobs
        </button>
        <span>/</span>
        <span className="text-[#141618] font-semibold">{currentJob.title}</span>
      </nav>

      {/* TOP REQUISITION HEADER HERO CARD (Exact match to Image 3) */}
      <header className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-serif text-[#141618] font-semibold tracking-tight">
                {currentJob.title}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52] text-xs font-semibold">
                Active
              </span>
            </div>
            <p className="text-xs text-[#77736d]">
              {currentJob.department || 'Engineering'} · {currentJob.location || 'Remote · Full-time'} · Created Mar 12
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="h-9 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
              <span>Edit</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('add-candidates')}
              className="h-9 px-4 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">upload</span>
              <span>Add Resumes</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Stat Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Tile 1: Total candidates */}
          <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">group</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#141618] leading-none mb-1">48</div>
              <div className="text-[11px] font-medium text-[#77736d]">Total candidates</div>
            </div>
          </div>

          {/* Tile 2: Analyzed */}
          <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">fact_check</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#141618] leading-none mb-1">42</div>
              <div className="text-[11px] font-medium text-[#77736d]">Analyzed</div>
            </div>
          </div>

          {/* Tile 3: Processing */}
          <div className="p-4 rounded-xl bg-[#f8f7f4] border border-[#e7e2d9] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">progress_activity</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#141618] leading-none mb-1">6</div>
              <div className="text-[11px] font-medium text-[#77736d]">Processing</div>
            </div>
          </div>
        </div>
      </header>

      {/* Sub-tab Navigation */}
      <nav aria-label="Requisition sub tabs" className="flex items-center gap-2 border-b border-[#e7e2d9] pb-px overflow-x-auto">
        {(['overview', 'candidates', 'requirements', 'comparison', 'activity'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setJobWorkspaceTab(tab)}
            className={`h-10 px-4 text-xs font-semibold capitalize border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              jobWorkspaceTab === tab
                ? 'border-[#141618] text-[#141618]'
                : 'border-transparent text-[#77736d] hover:text-[#141618]'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* TAB: OVERVIEW (Exact match to Image 3) */}
      {jobWorkspaceTab === 'overview' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Job description summary */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 sm:p-8 flex flex-col justify-between gap-6">
            <div>
              <h2 className="text-base font-bold text-[#141618] mb-3">Job description summary</h2>
              <p className="text-xs sm:text-sm text-[#141618] leading-relaxed mb-6">
                {currentJob.description_raw ||
                  'Own our async billing pipeline serving 2M events/day. Python + FastAPI + PostgreSQL + Redis. You lead system design, code review and on-call for the billing domain. 3–6 years backend experience required.'}
              </p>

              {/* Mandatory Skills Chips */}
              <div className="mb-5">
                <div className="text-[11px] font-bold text-[#a9874e] uppercase tracking-wider mb-2.5">
                  Mandatory Skills
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Python', 'FastAPI', 'PostgreSQL', 'Redis', 'System Design'].map(skill => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-xs font-medium"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#a9874e]" />
                      <span>{skill}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Preferred Skills Chips */}
              <div>
                <div className="text-[11px] font-bold text-[#77736d] uppercase tracking-wider mb-2.5">
                  Preferred
                </div>
                <div className="flex flex-wrap gap-2">
                  {['Docker', 'AWS', 'Kafka'].map(skill => (
                    <span
                      key={skill}
                      className="px-3 py-1 rounded-lg bg-[#f8f7f4] border border-[#e7e2d9] text-[#59616b] text-xs font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Dark "Ready to discover evidence?" Card */}
          <div className="lg:col-span-5 bg-[#141618] rounded-2xl p-6 sm:p-8 text-white shadow-card flex flex-col justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#d4af37] text-[20px]">description</span>
                <h2 className="text-base font-semibold text-white">Ready to discover evidence?</h2>
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                Upload resumes and Skitrace links GitHub, LinkedIn and LeetCode proof to every requirement automatically.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={() => setActiveView('add-candidates')}
                className="w-full h-12 rounded-xl bg-[#c5a467] hover:bg-[#d4af37] text-[#141618] font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">upload</span>
                <span>Add Resumes</span>
              </button>
              <p className="text-[11px] text-[#9c9890] text-center">
                PDF only · Single or batch · ~15 sec per resume
              </p>
            </div>
          </div>
        </section>
      )}

      {/* TAB: CANDIDATES (Exact match to Image 5) */}
      {jobWorkspaceTab === 'candidates' && (
        <section className="space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-serif text-[#141618] font-semibold tracking-tight mb-1">
                Candidate Intelligence
              </h2>
              <p className="text-xs sm:text-sm text-[#77736d]">
                Understand how every candidate aligns with this job — {currentJob.title}.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="h-9 px-4 rounded-xl border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">tune</span>
                <span>Filters</span>
              </button>

              <button
                type="button"
                onClick={() => setJobWorkspaceTab('comparison')}
                className="h-9 px-4 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
                <span>Compare Candidates</span>
              </button>
            </div>
          </div>

          {/* 4 Bento Stat Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tile 1: Candidates Analyzed */}
            <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
                <span className="material-symbols-outlined text-[20px]">fact_check</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#141618] leading-none mb-1">42</div>
                <div className="text-[11px] font-medium text-[#77736d]">Candidates Analyzed</div>
              </div>
            </div>

            {/* Tile 2: Strong Evidence Matches */}
            <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#edf7f2] border border-[#b7e2ce] flex items-center justify-center text-[#247a52]">
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#141618] leading-none mb-1">11</div>
                <div className="text-[11px] font-medium text-[#77736d]">Strong Evidence Matches</div>
              </div>
            </div>

            {/* Tile 3: Needs Review */}
            <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#fdf2f2] border border-[#f5c4c4] flex items-center justify-center text-[#b54747]">
                <span className="material-symbols-outlined text-[20px]">flag</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#141618] leading-none mb-1">7</div>
                <div className="text-[11px] font-medium text-[#77736d]">Needs Review</div>
              </div>
            </div>

            {/* Tile 4: Avg. Evidence Coverage */}
            <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
                <span className="material-symbols-outlined text-[20px]">layers</span>
              </div>
              <div>
                <div className="text-2xl font-bold text-[#141618] leading-none mb-1">82%</div>
                <div className="text-[11px] font-medium text-[#77736d]">Avg. Evidence Coverage</div>
              </div>
            </div>
          </div>

          {/* Filter Bar Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-[#e7e2d9] shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#59616b] hover:text-[#141618]"
              >
                Job Fit: All
              </button>

              <button
                type="button"
                onClick={() => setActiveSkillFilter(f => f === 'Python' ? 'All' : 'Python')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                  activeSkillFilter === 'Python'
                    ? 'bg-[#faf5e8] border-[#ebd8a8] text-[#745723]'
                    : 'border-[#e7e2d9] bg-[#f8f7f4] text-[#59616b]'
                }`}
              >
                Skills: Python
              </button>

              <button
                type="button"
                onClick={() => setActiveEvidenceFilter(f => f === '70%+' ? 'All' : '70%+')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                  activeEvidenceFilter === '70%+'
                    ? 'bg-[#faf5e8] border-[#ebd8a8] text-[#745723]'
                    : 'border-[#e7e2d9] bg-[#f8f7f4] text-[#59616b]'
                }`}
              >
                Evidence: 70%+
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter(s => s === 'All' ? 'Analyzed' : 'All')}
                className="px-3 py-1.5 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#59616b]"
              >
                Status: {statusFilter}
              </button>

              <button
                type="button"
                className="px-3 py-1.5 rounded-xl border border-[#e7e2d9] bg-[#f8f7f4] text-xs font-medium text-[#59616b]"
              >
                Source: All platforms
              </button>
            </div>

            <div className="text-xs text-[#77736d] font-medium pr-2">
              {filteredCandidates.length} of 42 shown
            </div>
          </div>

          {/* DENSE CANDIDATE LEDGER TABLE (Exact match to Image 5) */}
          <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#e7e2d9] bg-[#faf9f6] text-[11px] font-bold text-[#77736d] uppercase tracking-wider">
                    <th className="py-3.5 px-6">Candidate</th>
                    <th className="py-3.5 px-4">Technical Skills</th>
                    <th className="py-3.5 px-4 text-center">Job Fit</th>
                    <th className="py-3.5 px-4 text-center">Mandatory</th>
                    <th className="py-3.5 px-4">Evidence</th>
                    <th className="py-3.5 px-4">Identity</th>
                    <th className="py-3.5 px-6 text-right">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#f2efe9] text-xs text-[#141618]">
                  {filteredCandidates.map(candidate => (
                    <tr key={candidate.id} className="hover:bg-[#faf9f6] transition-colors">
                      {/* Column 1: Candidate */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#ebd8a8] border border-[#a9874e]/30 flex items-center justify-center text-[#745723] font-bold text-xs shrink-0">
                            {candidate.avatar}
                          </div>
                          <div>
                            <div className="font-bold text-[#141618] hover:text-[#a9874e] cursor-pointer" onClick={() => openCandidateDetail(candidate.id)}>
                              {candidate.name}
                            </div>
                            <div className="text-[11px] text-[#77736d]">{candidate.role}</div>
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Technical Skills */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {candidate.skills.map(s => (
                            <span key={s} className="px-2.5 py-0.5 rounded-lg bg-[#f8f7f4] border border-[#e7e2d9] text-[11px] font-medium text-[#141618]">
                              {s}
                            </span>
                          ))}
                          <span className="px-2 py-0.5 rounded-lg bg-[#f8f7f4] border border-[#e7e2d9] text-[10px] text-[#77736d]">
                            +{candidate.extraSkillsCount}
                          </span>
                        </div>
                      </td>

                      {/* Column 3: Job Fit */}
                      <td className="py-4 px-4 text-center">
                        <span className="font-bold text-sm text-[#a9874e]">
                          {candidate.jobFit}
                        </span>
                      </td>

                      {/* Column 4: Mandatory */}
                      <td className="py-4 px-4 text-center font-semibold text-[#141618]">
                        {candidate.mandatoryCoverage}
                      </td>

                      {/* Column 5: Evidence */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2.5 min-w-[120px]">
                          <div className="flex-1 h-1.5 rounded-full bg-[#eeece6] overflow-hidden">
                            <div
                              className="h-full bg-[#c5a467] rounded-full"
                              style={{ width: `${candidate.evidenceScore}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-[#77736d] shrink-0">
                            {candidate.evidenceScore}%
                          </span>
                        </div>
                      </td>

                      {/* Column 6: Identity */}
                      <td className="py-4 px-4">
                        <div>
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-0.5 ${
                              candidate.identityTier === 'High'
                                ? 'bg-[#edf7f2] border border-[#b7e2ce] text-[#247a52]'
                                : candidate.identityTier === 'Medium'
                                ? 'bg-[#fef8e7] border border-[#ebd8a8] text-[#745723]'
                                : 'bg-[#f4f2ee] border border-[#e2ded6] text-[#77736d]'
                            }`}
                          >
                            {candidate.identityTier}
                          </span>
                          <div className="text-[11px] text-[#77736d]">{candidate.identityStatus}</div>
                        </div>
                      </td>

                      {/* Column 7: Action */}
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => openCandidateDetail(candidate.id)}
                          className="h-8 px-3 rounded-lg border border-[#e7e2d9] bg-white hover:bg-[#faf5e8] hover:border-[#ebd8a8] text-[#141618] text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                        >
                          View Intelligence
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Placeholder tabs for Requirements, Comparison, Activity */}
      {jobWorkspaceTab === 'requirements' && (
        <section className="p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <h2 className="text-xl font-bold text-[#141618] mb-2">Requirements Workspace</h2>
          <p className="text-xs text-[#77736d]">
            Detailed verifiable requirements extracted for {currentJob.title}.
          </p>
        </section>
      )}

      {jobWorkspaceTab === 'comparison' && (
        <CandidateComparisonView onBack={() => setJobWorkspaceTab('overview')} />
      )}

      {jobWorkspaceTab === 'activity' && (
        <section className="p-8 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
          <h2 className="text-xl font-bold text-[#141618] mb-2">Requisition Activity Audit</h2>
          <p className="text-xs text-[#77736d]">
            Log of pipeline runs, resume ingestions and candidate verifications.
          </p>
        </section>
      )}
    </div>
  )
}
