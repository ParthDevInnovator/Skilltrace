import { useJob } from '@/context/JobContext'
import { CandidateGrid } from '@/components/dashboard/CandidateGrid'

interface DashboardOverviewProps {
  onOpenCustomJDModal: () => void
}

export function DashboardOverview({ onOpenCustomJDModal }: DashboardOverviewProps) {
  const { selectedJob, jobs } = useJob()

  return (
    <div className="flex flex-col gap-6 max-w-[1600px] w-full mx-auto pb-12">
      {/* Top Action Bar & Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold text-[#181c23] tracking-tight">Recruiter Overview</h1>
          <p className="text-xs text-[#65646f]">
            Your hiring workspace at a glance — verified evidence across open requisitions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#e5e7eb] text-[#181c23] text-xs font-semibold shadow-xs hover:bg-[#f8fafc] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-[#797584]">download</span>
            <span>Export Digest</span>
          </button>
          <button
            type="button"
            onClick={onOpenCustomJDModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6554c0] text-white text-xs font-semibold shadow-sm hover:bg-[#5545a8] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create Job</span>
          </button>
        </div>
      </div>

      {/* 4-Column Compact Metric Cards (Directly from Stitch Screen) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-[#797584] uppercase tracking-wider">
              Active Jobs
            </span>
            <div className="p-2 rounded-lg bg-[#f1f3fe] text-[#4d3aa6]">
              <span className="material-symbols-outlined text-[18px]">work</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#181c23] tracking-tight">
              {jobs.length > 0 ? jobs.length : 5}
            </div>
            <div className="text-[11px] text-[#65646f] mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6554c0]"></span>
              <span>3 requisitions closing this week</span>
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-[#797584] uppercase tracking-wider">
              Candidates Reviewed
            </span>
            <div className="p-2 rounded-lg bg-[#f1f3fe] text-[#247a52]">
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#181c23] tracking-tight">84</div>
            <div className="text-[11px] text-[#247a52] font-semibold mt-0.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">trending_up</span>
              <span>+14 since yesterday</span>
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-[#797584] uppercase tracking-wider">
              Interviews Scheduled
            </span>
            <div className="p-2 rounded-lg bg-[#f1f3fe] text-[#4d3aa6]">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#181c23] tracking-tight">19</div>
            <div className="text-[11px] text-[#65646f] mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6554c0]"></span>
              <span>6 scheduled for today</span>
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-xs font-semibold text-[#797584] uppercase tracking-wider">
              Awaiting Review
            </span>
            <div className="p-2 rounded-lg bg-[#f1f3fe] text-[#a66a19]">
              <span className="material-symbols-outlined text-[18px]">schedule</span>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#181c23] tracking-tight">28</div>
            <div className="text-[11px] text-[#a66a19] mt-0.5 flex items-center gap-1 font-medium">
              <span className="material-symbols-outlined text-[14px]">priority_high</span>
              <span>6 seeded candidates ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Selected Requisition Card (from Stitch Jobs & Candidate Matching Screen) */}
      {selectedJob && (
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-[#ebedf9] pb-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[22px] text-[#6554c0]">
                assignment_turned_in
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#181c23]">{selectedJob.title}</h2>
                  <span className="text-[11px] font-semibold text-[#247a52] bg-[#edf7f2] border border-[#b7e2ce] px-2 py-0.5 rounded-full">
                    Active Target Requisition
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#65646f] mt-0.5">
                  <span className="font-mono text-[#4d3aa6]">#{selectedJob.id}</span>
                  <span>•</span>
                  <span>{selectedJob.department}</span>
                  <span>•</span>
                  <span>{selectedJob.location}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenCustomJDModal}
              className="text-xs font-semibold text-[#6554c0] hover:underline flex items-center gap-1 self-start md:self-auto"
            >
              <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
              <span>Switch or Input Custom JD</span>
            </button>
          </div>

          {/* Requirements Preview */}
          {selectedJob.requirements_preview && selectedJob.requirements_preview.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#797584] uppercase tracking-wider">
                Key Requisition Requirements:
              </span>
              <div className="flex flex-wrap gap-2">
                {selectedJob.requirements_preview.map((req, i) => (
                  <span
                    key={i}
                    className="text-xs bg-[#f1f3fe] text-[#181c23] border border-[#e5e7eb] px-2.5 py-1 rounded-md flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#6554c0]">
                      check_circle
                    </span>
                    <span>{req}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Candidates Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#181c23]">Candidate Pool</h2>
            <span className="text-xs font-semibold text-[#4d3aa6] bg-[#f1eefc] px-2 py-0.5 rounded-full">
              Evidence Verified
            </span>
          </div>
          <span className="text-xs text-[#65646f]">
            Comparing candidate claims against active requisition
          </span>
        </div>

        <CandidateGrid />
      </div>
    </div>
  )
}
