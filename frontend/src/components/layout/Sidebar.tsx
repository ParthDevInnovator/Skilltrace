import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { ProfileAvatar } from './ProfileAvatar'

export function Sidebar() {
  const { activeView, setActiveView } = useJob()
  const { user, logout } = useAuth()

  return (
    <aside className="workspace-sidebar bg-white border-r border-[#e7e2d9] z-40 flex flex-col justify-between shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-[#e7e2d9]">
          <div className="w-8 h-8 rounded-lg bg-[#141618] flex items-center justify-center text-white font-serif italic text-base shrink-0 shadow-sm">
            S
          </div>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-sans font-bold text-base tracking-tight text-[#141618]">skitrace</span>
            <span className="text-[10px] text-[#59616b] tracking-wide uppercase font-medium">Candidate Intelligence</span>
          </div>
        </div>

        {/* Section 1: WORKSPACE */}
        <div className="px-6 pt-6 pb-2">
          <span className="text-[11px] font-bold text-[#59616b] tracking-wider uppercase">
            Workspace
          </span>
        </div>
        <nav aria-label="Workspace" className="flex flex-col px-3 space-y-1">
          <button
            type="button"
            aria-current={activeView === 'overview' ? 'page' : undefined}
            onClick={() => setActiveView('overview')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'overview'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'overview' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              dashboard
            </span>
            Overview
          </button>

          <button
            type="button"
            aria-current={(activeView === 'jobs' || activeView === 'job-detail' || activeView === 'add-candidates' || activeView === 'pipeline') ? 'page' : undefined}
            onClick={() => setActiveView('jobs')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'jobs' || activeView === 'job-detail' || activeView === 'add-candidates' || activeView === 'pipeline'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'jobs' || activeView === 'job-detail' || activeView === 'add-candidates' || activeView === 'pipeline' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              work
            </span>
            Jobs
          </button>

          <button
            type="button"
            aria-current={(activeView === 'talent-pool' || activeView === 'candidates' || activeView === 'candidate-detail') ? 'page' : undefined}
            onClick={() => setActiveView('talent-pool')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'talent-pool' || activeView === 'candidates' || activeView === 'candidate-detail'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'talent-pool' || activeView === 'candidates' || activeView === 'candidate-detail' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              group
            </span>
            Talent Pool
          </button>
        </nav>

        {/* Section 2: INTELLIGENCE */}
        <div className="px-6 pt-6 pb-2">
          <span className="text-[11px] font-bold text-[#59616b] tracking-wider uppercase">
            Intelligence
          </span>
        </div>
        <nav aria-label="Intelligence" className="flex flex-col px-3 space-y-1">
          <button
            type="button"
            aria-current={activeView === 'evidence' ? 'page' : undefined}
            onClick={() => setActiveView('evidence')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'evidence'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'evidence' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              fact_check
            </span>
            Evidence Explorer
          </button>

          <button
            type="button"
            aria-current={activeView === 'talent-discovery' ? 'page' : undefined}
            onClick={() => setActiveView('talent-discovery')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'talent-discovery'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'talent-discovery' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              saved_search
            </span>
            Talent Discovery
          </button>

          <button
            type="button"
            aria-current={activeView === 'graph' ? 'page' : undefined}
            onClick={() => setActiveView('graph')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer ${
              activeView === 'graph'
                ? 'bg-[#f8f1e3] text-[#141618] shadow-xs relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-[#a9874e] before:rounded-r'
                : 'text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618]'
            }`}
          >
            <span aria-hidden="true" className={`material-symbols-outlined text-[19px] ${activeView === 'graph' ? 'text-[#a9874e]' : 'text-[#59616b]'}`}>
              hub
            </span>
            Knowledge Graph
          </button>
        </nav>

        {/* Section 3: ACCOUNT */}
        <div className="px-6 pt-6 pb-2">
          <span className="text-[11px] font-bold text-[#59616b] tracking-wider uppercase">
            Account
          </span>
        </div>
        <nav aria-label="Account" className="flex flex-col px-3 space-y-1">
          <button
            type="button"
            disabled title="Settings are not available"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left text-[#59616b] hover:bg-[#f8f7f4] hover:text-[#141618] cursor-pointer"
          >
            <span className="material-symbols-outlined text-[19px] text-[#59616b]">
              settings
            </span>
            Settings
          </button>
        </nav>
      </div>

      {/* Signed-in account details; permissions come from server roles. */}
      <div className="p-3 border-t border-[#e7e2d9] bg-white">
        <div className="p-2 rounded-xl border border-[#e7e2d9] bg-[#fbf9f6] flex items-center justify-between gap-3 shadow-2xs hover:bg-[#f5f3ed] transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <ProfileAvatar name={user?.full_name || 'Signed-in user'} imageUrl={user?.image_url} />
            <div className="flex flex-col min-w-0">
              <span title={user?.full_name} className="text-xs font-bold text-[#141618] truncate leading-tight">
                {user?.full_name || 'Signed-in user'}
              </span>
              {user?.email && <span title={user.email} className="text-[11px] text-[#59616b] truncate leading-tight">{user.email}</span>}
              <span className="text-[11px] text-[#59616b] truncate leading-tight">
                {user?.roles?.[0] ? user.roles[0].replaceAll('_', ' ') : 'No role assigned'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            aria-label="Sign out" title="Sign out"
            className="p-1 rounded-lg text-[#59616b] hover:text-[#141618] hover:bg-white/60 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">unfold_more</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
