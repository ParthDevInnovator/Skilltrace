import { useJob } from '@/context/JobContext'
import { CandidateGrid } from '@/components/dashboard/CandidateGrid'
import { RequirementChips } from '@/components/dashboard/RequirementFilter'
import { JobStatus } from '@/components/common/JobStatus'

export function DashboardOverview({ onOpenCustomJDModal }: { onOpenCustomJDModal: () => void }) {
  const { jobs, selectedJob, setSelectedJob, setActiveView, openCandidateDetail } = useJob()

  // Ensure default demo jobs exist if server returned empty
  const displayJobs = jobs.length > 0 ? jobs.slice(0, 3) : [
    {
      id: 'JOB-BACKEND',
      title: 'Backend Engineer',
      department: 'Engineering',
      location: 'Remote',
      description_raw: 'Python, FastAPI, distributed systems',
      requirements: [],
    },
    {
      id: 'JOB-AI',
      title: 'AI Engineer',
      department: 'ML Platform',
      location: 'Hybrid',
      description_raw: 'PyTorch, LLMs, Vector search',
      requirements: [],
    },
    {
      id: 'JOB-FULLSTACK',
      title: 'Full Stack Developer',
      department: 'Product',
      location: 'Berlin',
      description_raw: 'TypeScript, React, Node',
      requirements: [],
    },
  ]

  const topFitScores: Record<string, string> = {
    '0': '92 top fit',
    '1': '88 top fit',
    '2': '81 top fit',
  }

  const candidateCounts: Record<string, string> = {
    '0': '48 candidates',
    '1': '31 candidates',
    '2': '64 candidates',
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-16">
      {/* Status Feedback (Loading / Error alert) */}
      <JobStatus />

      {/* Active Requisition Card (Preserving all tests & accessible info) */}
      <section className="panel p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card">
        <h2 className="text-xs font-bold text-[#a9874e] uppercase tracking-wider mb-2">Active Requisition</h2>
        {selectedJob ? (
          <div>
            <h3 className="text-lg font-bold text-[#141618] mb-1">{selectedJob.title}</h3>
            <p className="text-xs text-[#77736d] mb-3">{selectedJob.department} - {selectedJob.location}</p>
            <RequirementChips job={selectedJob} />
          </div>
        ) : (
          <p className="text-xs text-[#77736d]">Select a job in the header or create a custom requisition.</p>
        )}
      </section>
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-1">
            Your Hiring Intelligence
          </h1>
          <p className="text-[#77736d] text-sm">
            Discover, analyze and compare candidates across your open roles.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-[#e7e2d9] bg-white hover:bg-[#f8f7f4] text-[#141618] text-xs font-medium self-start sm:self-auto shadow-2xs transition-colors"
        >
          <span className="material-symbols-outlined text-[17px] text-[#77736d]">schedule</span>
          <span>Last 30 days</span>
        </button>
      </section>

      {/* 4 Bento Metric Cards (Exact match to Image 3) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Jobs */}
        <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">work</span>
            </div>
          </div>
          <div>
            <div className="text-3xl font-sans font-bold text-[#141618] tracking-tight leading-none mb-1">
              {jobs.length > 0 ? jobs.length : 6}
            </div>
            <div className="text-xs font-semibold text-[#141618] mb-0.5">Active Jobs</div>
            <div className="text-[11px] text-[#77736d]">+2 this month</div>
          </div>
        </div>

        {/* Card 2: Total Candidates */}
        <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">group</span>
            </div>
          </div>
          <div>
            <div className="text-3xl font-sans font-bold text-[#141618] tracking-tight leading-none mb-1">
              214
            </div>
            <div className="text-xs font-semibold text-[#141618] mb-0.5">Total Candidates</div>
            <div className="text-[11px] text-[#77736d]">+38 this week</div>
          </div>
        </div>

        {/* Card 3: Candidates Analyzed */}
        <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">document_scanner</span>
            </div>
          </div>
          <div>
            <div className="text-3xl font-sans font-bold text-[#141618] tracking-tight leading-none mb-1">
              168
            </div>
            <div className="text-xs font-semibold text-[#141618] mb-0.5">Candidates Analyzed</div>
            <div className="text-[11px] text-[#77736d]">79% coverage</div>
          </div>
        </div>

        {/* Card 4: Evidence Discovered */}
        <div className="p-5 rounded-2xl bg-white border border-[#e7e2d9] shadow-card flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] flex items-center justify-center text-[#745723]">
              <span className="material-symbols-outlined text-[20px]">layers</span>
            </div>
          </div>
          <div>
            <div className="text-3xl font-sans font-bold text-[#141618] tracking-tight leading-none mb-1">
              1,240
            </div>
            <div className="text-xs font-semibold text-[#141618] mb-0.5">Evidence Discovered</div>
            <div className="text-[11px] text-[#77736d]">Across 4 platforms</div>
          </div>
        </div>
      </section>

      {/* Main Two-Column Layout (Recent Jobs on Left, Analyses + Activity on Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Recent Jobs (7 columns) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-[#141618]">Recent Jobs</h2>
              <button
                type="button"
                onClick={() => setActiveView('jobs')}
                className="text-xs font-semibold text-[#77736d] hover:text-[#141618] transition-colors"
              >
                View all
              </button>
            </div>

            {/* Job Items List */}
            <div className="divide-y divide-[#f2efe9]">
              {displayJobs.map((job, idx) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job)
                    setActiveView('candidates')
                  }}
                  className="py-4 first:pt-0 last:pb-4 flex items-center justify-between gap-4 group cursor-pointer hover:bg-[#faf9f6] rounded-xl px-2 -mx-2 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#f4f1ea] border border-[#e7e2d9] flex items-center justify-center text-[#141618] font-semibold text-xs shrink-0">
                      {job.title.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#141618] truncate group-hover:text-[#a9874e] transition-colors">
                        {job.title}
                      </div>
                      <p className="text-xs text-[#77736d] truncate">
                        {job.department} · {job.location} · {candidateCounts[String(idx)] || '30+ candidates'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-2.5 py-1 rounded-md bg-[#faf5e8] border border-[#ebd8a8] text-[#765c29] text-xs font-semibold">
                      {topFitScores[String(idx)] || '85 top fit'}
                    </span>
                    <span className="material-symbols-outlined text-[18px] text-[#77736d] group-hover:text-[#141618] transition-colors">
                      arrow_forward
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full-width + Create Job Button */}
          <div className="pt-4 mt-2 border-t border-[#f2efe9]">
            <button
              type="button"
              onClick={onOpenCustomJDModal}
              className="w-full h-11 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Job</span>
            </button>
          </div>
        </div>

        {/* Right Column: Recent Candidate Analyses + Dark Activity Card (5 columns) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Recent Candidate Analyses */}
          <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6">
            <h2 className="text-base font-bold text-[#141618] mb-4">Recent Candidate Analyses</h2>
            <div className="space-y-4">
              {/* Candidate 1 */}
              <div
                onClick={() => openCandidateDetail('CAND-001')}
                className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[#faf9f6] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#ebd8a8] border border-[#a9874e]/30 flex items-center justify-center text-[#745723] text-xs font-bold shrink-0">
                    MC
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#141618] truncate">Maya Chen</div>
                    <div className="text-[11px] text-[#77736d] truncate">Backend Engineer · 92 fit</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#247a52] text-xs font-semibold shrink-0">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  <span>Verified</span>
                </div>
              </div>

              {/* Candidate 2 */}
              <div
                onClick={() => openCandidateDetail('CAND-002')}
                className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[#faf9f6] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#d7e2e8] border border-[#a8c1cf] flex items-center justify-center text-[#2d5268] text-xs font-bold shrink-0">
                    JW
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#141618] truncate">Jonas Weber</div>
                    <div className="text-[11px] text-[#77736d] truncate">AI Engineer · 88 fit</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#247a52] text-xs font-semibold shrink-0">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  <span>Verified</span>
                </div>
              </div>

              {/* Candidate 3 */}
              <div
                onClick={() => openCandidateDetail('CAND-003')}
                className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-[#faf9f6] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#ebd0ce] border border-[#cf9e9a] flex items-center justify-center text-[#682d28] text-xs font-bold shrink-0">
                    PN
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#141618] truncate">Priya Nair</div>
                    <div className="text-[11px] text-[#77736d] truncate">Full Stack · 84 fit</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[#247a52] text-xs font-semibold shrink-0">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  <span>Verified</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Intelligence Activity (Exact dark box from Image 3) */}
          <div className="bg-[#1a1a1a] rounded-2xl p-6 text-white shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#d4af37] text-[18px]">auto_awesome</span>
              <h3 className="text-sm font-semibold tracking-tight text-white">Intelligence Activity</h3>
            </div>
            <ul className="space-y-3 text-xs text-white/80 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-[#d4af37] leading-none mt-1">•</span>
                <span>14 new GitHub evidence linked to Backend Engineer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#d4af37] leading-none mt-1">•</span>
                <span>Batch analysis finished: 24 resumes in 6 min</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#d4af37] leading-none mt-1">•</span>
                <span>2 skill contradictions flagged for review</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Candidate Pool Section (Preserving 100% of candidate evaluation functionality) */}
      <section className="mt-4 pt-8 border-t border-[#e7e2d9]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-[#141618]">Candidate Evaluation Pool</h2>
            <p className="text-xs text-[#77736d]">
              {selectedJob ? `Ranked against active requisition: ${selectedJob.title}` : 'Select a job to assess role fit.'}
            </p>
          </div>
        </div>
        <CandidateGrid />
      </section>
    </div>
  )
}
