import { useJob } from '@/context/JobContext'
import { JobSelector } from '@/components/dashboard/JobSelector'

interface HeaderProps {
  onOpenCustomJDModal: () => void
}

export function Header({ onOpenCustomJDModal }: HeaderProps) {
  const { searchQuery, setSearchQuery, activeView } = useJob()

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-white border-b border-[#e5e7eb] z-40 px-6 flex items-center justify-between">
      {/* Left section: Breadcrumb & Job Selector */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-[#65646f] whitespace-nowrap">
          <span>Workspace</span>
          <span className="material-symbols-outlined text-[14px] text-[#797584]">chevron_right</span>
          <span className="text-[#181c23] font-semibold capitalize">
            {activeView === 'candidate-detail' ? 'Candidate Profile' : activeView}
          </span>
        </div>

        <div className="hidden xl:block h-4 w-px bg-[#e5e7eb] mx-1"></div>

        {/* Active Job Selector Dropdown */}
        <JobSelector onOpenCustomJDModal={onOpenCustomJDModal} />
      </div>

      {/* Right section: Global Search & Quick Actions */}
      <div className="flex items-center gap-3.5">
        <div className="relative flex items-center w-64 md:w-80">
          <span className="material-symbols-outlined absolute left-2.5 text-[18px] text-[#797584] pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidates, skills, claims..."
            className="w-full h-8 pl-8 pr-12 rounded-md bg-[#f9f9ff] border border-[#e5e7eb] text-xs text-[#181c23] placeholder:text-[#797584] focus:outline-none focus:border-[#6554c0] transition-colors"
          />
          <kbd className="absolute right-2 px-1.5 py-0.5 text-[10px] font-semibold text-[#65646f] bg-[#ebedf9] border border-[#c9c4d4] rounded">
            ⌘K
          </kbd>
        </div>

        <button
          type="button"
          className="relative p-1.5 text-[#65646f] hover:text-[#181c23] rounded-md hover:bg-[#f1f3fe] transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#6554c0] rounded-full"></span>
        </button>

        <div className="h-4 w-px bg-[#e5e7eb]"></div>

        <div className="flex items-center gap-1.5 cursor-pointer pl-1">
          <div className="w-7 h-7 rounded-full bg-[#ebedf9] text-[#4d3aa6] flex items-center justify-center font-semibold text-xs border border-[#c9c4d4]">
            ER
          </div>
          <span className="material-symbols-outlined text-[16px] text-[#797584]">
            keyboard_arrow_down
          </span>
        </div>
      </div>
    </header>
  )
}
