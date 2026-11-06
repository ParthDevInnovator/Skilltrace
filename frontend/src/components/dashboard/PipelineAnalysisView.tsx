import { useState, useEffect } from 'react'
import { useJob } from '@/context/JobContext'

export function PipelineAnalysisView() {
  const { selectedJob, openCandidateDetail, setActiveView } = useJob()
  const jobTitle = selectedJob?.title || 'Backend Engineer'

  const [overallProgress, setOverallProgress] = useState(62)
  const [step5Progress, setStep5Progress] = useState(74)
  const [step6Progress, setStep6Progress] = useState(48)

  // Subtle live progress animation simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setOverallProgress(prev => (prev < 100 ? prev + 1 : 100))
      setStep5Progress(prev => (prev < 100 ? prev + 2 : 100))
      setStep6Progress(prev => (prev < 100 ? prev + 1 : 100))
    }, 1200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="min-h-screen bg-[#f8f7f4] flex flex-col lg:flex-row">
      {/* LEFT SPLIT: Dark Document Preview Panel (Exact match to Image 4) */}
      <aside className="w-full lg:w-[380px] xl:w-[420px] bg-[#1d2024] text-white p-6 sm:p-8 flex flex-col justify-between shrink-0 shadow-lg">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#b54747] text-white flex items-center justify-center text-xs font-bold shrink-0">
                PDF
              </div>
              <div>
                <div className="text-xs font-bold text-white">maya-chen-resume.pdf</div>
                <div className="text-[11px] text-white/60">2 pages · 1.8 MB</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveView('job-detail')}
              className="text-white/60 hover:text-white text-xs"
              title="Close and return to workspace"
            >
              ✕
            </button>
          </div>

          {/* White Floating Resume Sheet Preview */}
          <div className="bg-white rounded-2xl p-6 text-[#141618] shadow-2xl space-y-5">
            <div>
              <div className="text-xl font-serif font-bold text-[#141618]">Maya Chen</div>
              <div className="text-xs text-[#77736d]">Backend Engineer · Berlin</div>
            </div>

            {/* Summary Block */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-[#a9874e] uppercase tracking-wider">
                Summary
              </div>
              <div className="space-y-1.5">
                <div className="h-2 rounded bg-[#e7e2d9] w-full" />
                <div className="h-2 rounded bg-[#e7e2d9] w-5/6" />
                <div className="h-2 rounded bg-[#eeece6] w-2/3" />
              </div>
            </div>

            {/* Experience Block */}
            <div className="space-y-2 pt-2">
              <div className="text-[10px] font-bold text-[#a9874e] uppercase tracking-wider">
                Experience
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded bg-[#2a2d32] w-1/2" />
                <div className="h-2 rounded bg-[#e7e2d9] w-full" />
                <div className="h-2 rounded bg-[#e7e2d9] w-4/5" />
              </div>
            </div>

            {/* Skills Pills */}
            <div className="pt-2 flex flex-wrap gap-1.5">
              {['Python', 'FastAPI', 'Redis'].map(skill => (
                <span
                  key={skill}
                  className="px-2.5 py-1 rounded-lg bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] text-[11px] font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs text-white/60 pt-6 border-t border-white/10">
          <span>Page 1 of 2</span>
          <span>Batch queue · 3 remaining</span>
        </div>
      </aside>

      {/* RIGHT MAIN AREA: 8-Stage Progress Telemetry (Exact match to Image 4) */}
      <main className="flex-1 p-6 sm:p-10 lg:p-12 max-w-4xl flex flex-col justify-between gap-8">
        <div className="space-y-6">
          {/* Header Eyebrow & Titles */}
          <div>
            <div className="text-xs font-bold text-[#a9874e] uppercase tracking-wider mb-1.5">
              ANALYZING · {jobTitle.toUpperCase()}
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif text-[#141618] font-normal tracking-tight mb-2">
              Discovering Candidate Intelligence
            </h1>
            <p className="text-sm text-[#77736d]">
              Linking resume claims to live proof across platforms.
            </p>
          </div>

          {/* Overall Progress Container */}
          <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-card p-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[#141618]">Overall progress</span>
              <span className="text-[#77736d]">{overallProgress}% · Step 5 of 8</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#eeece6] overflow-hidden">
              <div
                className="h-full bg-[#c5a467] rounded-full transition-all duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* 8 Sequential Pipeline Step Cards (Exact match to Image 4) */}
          <div className="space-y-3">
            {/* Step 1: Resume Extraction (Completed) */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-xs p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#141618] text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    Resume Extraction — Completed
                  </div>
                  <div className="text-xs text-[#77736d]">Parsed 2 pages · 14 skills detected</div>
                </div>
              </div>
            </div>

            {/* Step 2: Candidate Identification (Completed) */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-xs p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#141618] text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    Candidate Identification — Completed
                  </div>
                  <div className="text-xs text-[#77736d]">Maya Chen · Berlin · High confidence</div>
                </div>
              </div>
            </div>

            {/* Step 3: GitHub Discovery (Completed) */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-xs p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#141618] text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    GitHub Discovery — Completed
                  </div>
                  <div className="text-xs text-[#77736d]">Found mayachen · 34 repos scanned</div>
                </div>
              </div>
            </div>

            {/* Step 4: LinkedIn Discovery (Completed) */}
            <div className="bg-white rounded-2xl border border-[#e7e2d9] shadow-xs p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#141618] text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    LinkedIn Discovery — Completed
                  </div>
                  <div className="text-xs text-[#77736d]">Profile matched · 6 yrs verified</div>
                </div>
              </div>
            </div>

            {/* Step 5: LeetCode Discovery (In progress) */}
            <div className="bg-white rounded-2xl border border-[#ebd8a8] shadow-card p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">code</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    LeetCode Discovery — In progress
                  </div>
                  <div className="text-xs text-[#77736d]">412 solved · Top 8 percent</div>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden ml-12">
                <div
                  className="h-full bg-[#c5a467] rounded-full transition-all"
                  style={{ width: `${step5Progress}%` }}
                />
              </div>
            </div>

            {/* Step 6: Project Analysis (In progress) */}
            <div className="bg-white rounded-2xl border border-[#ebd8a8] shadow-card p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#faf5e8] border border-[#ebd8a8] text-[#745723] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">terminal</span>
                </div>
                <div className="flex-1">
                  <div className="text-xs sm:text-sm font-bold text-[#141618]">
                    Project Analysis — In progress
                  </div>
                  <div className="text-xs text-[#77736d]">Scoring 8 repos for async evidence</div>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#eeece6] overflow-hidden ml-12">
                <div
                  className="h-full bg-[#c5a467] rounded-full transition-all"
                  style={{ width: `${step6Progress}%` }}
                />
              </div>
            </div>

            {/* Step 7: Skill Verification (Pending) */}
            <div className="bg-white/80 rounded-2xl border border-[#e7e2d9] shadow-2xs p-4 sm:p-5 flex items-center gap-3.5 opacity-80">
              <div className="w-9 h-9 rounded-xl bg-[#f4f2ee] border border-[#e2ded6] text-[#77736d] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-[#59616b]">
                  Skill Verification — Pending
                </div>
                <div className="text-xs text-[#9c9890]">Cross-checking claims vs code</div>
              </div>
            </div>

            {/* Step 8: Job Matching (Pending) */}
            <div className="bg-white/80 rounded-2xl border border-[#e7e2d9] shadow-2xs p-4 sm:p-5 flex items-center gap-3.5 opacity-80">
              <div className="w-9 h-9 rounded-xl bg-[#f4f2ee] border border-[#e2ded6] text-[#77736d] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[18px]">fingerprint</span>
              </div>
              <div>
                <div className="text-xs sm:text-sm font-bold text-[#59616b]">
                  Job Matching — Pending
                </div>
                <div className="text-xs text-[#9c9890]">
                  Scoring fit against {jobTitle}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Footer */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#e7e2d9]">
          <button
            type="button"
            onClick={() => setActiveView('job-detail')}
            className="text-xs text-[#77736d] hover:text-[#141618] transition-colors cursor-pointer"
          >
            ← Cancel analysis & return
          </button>

          <button
            type="button"
            onClick={() => openCandidateDetail('CAND-001')}
            className="h-11 px-6 rounded-xl bg-[#141618] hover:bg-[#2a2d32] text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <span>View Candidate Intelligence Dossier</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </main>
    </div>
  )
}

