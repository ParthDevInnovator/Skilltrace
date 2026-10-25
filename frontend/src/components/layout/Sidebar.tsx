import { useJob } from '@/context/JobContext'

export function Sidebar() {
  const { activeView, setActiveView } = useJob()

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-[#e5e7eb] z-50 flex flex-col justify-between select-none">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center gap-2.5 border-b border-[#e5e7eb]">
          <div className="w-8 h-8 rounded-lg bg-[#6554c0] flex items-center justify-center text-white font-bold text-sm shadow-sm">
            ST
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm text-[#181c23] leading-tight truncate">
              Skilltrace
            </span>
            <span className="text-[11px] text-[#65646f] leading-tight truncate">
              Trace Skills to Evidence
            </span>
          </div>
        </div>

        {/* Section Title */}
        <div className="px-4 pt-4 pb-1">
          <span className="text-[11px] font-semibold text-[#797584] uppercase tracking-wider">
            Workspace
          </span>
        </div>

        {/* Nav Links */}
        <nav className="flex flex-col gap-1 px-2.5">
          <button
            type="button"
            onClick={() => setActiveView('overview')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
              activeView === 'overview'
                ? 'bg-[#f1eefc] text-[#4d3aa6] border-l-[3px] border-[#6554c0]'
                : 'text-[#484552] hover:bg-[#f8fafc] hover:text-[#181c23]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">grid_view</span>
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('jobs')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
              activeView === 'jobs'
                ? 'bg-[#f1eefc] text-[#4d3aa6] border-l-[3px] border-[#6554c0]'
                : 'text-[#484552] hover:bg-[#f8fafc] hover:text-[#181c23]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">work_outline</span>
            <span>Jobs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('candidates')}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
              activeView === 'candidates' || activeView === 'candidate-detail'
                ? 'bg-[#f1eefc] text-[#4d3aa6] border-l-[3px] border-[#6554c0]'
                : 'text-[#484552] hover:bg-[#f8fafc] hover:text-[#181c23]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">group</span>
            <span>Candidates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('overview')}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-[#484552] hover:bg-[#f8fafc] hover:text-[#181c23] transition-colors text-left"
          >
            <span className="material-symbols-outlined text-[18px]">verified_user</span>
            <span>Evidence Explorer</span>
          </button>
        </nav>
      </div>

      {/* Footer & Recruiter Profile */}
      <div className="flex flex-col border-t border-[#e5e7eb]">
        <div className="p-3 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-[#ebedf9] text-[#4d3aa6] flex items-center justify-center font-semibold text-xs border border-[#c9c4d4]">
                ER
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#247a52] ring-2 ring-white"></span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-[#181c23] truncate leading-tight">
                Elena Rostova
              </span>
              <span className="text-[11px] text-[#65646f] truncate leading-tight">
                Lead Tech Recruiter
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-[18px] text-[#797584]">
            tune
          </span>
        </div>
      </div>
    </aside>
  )
}
