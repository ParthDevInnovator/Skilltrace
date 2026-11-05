import { useJob } from '@/context/JobContext'
import { useAuth } from '@/context/AuthContext'
import { UserButton } from '@clerk/react'
export function Sidebar() {
  const { activeView, setActiveView } = useJob()
  const {user,hasRole}=useAuth()
  return <aside className="workspace-sidebar">
    <div className="brand"><span className="brand-mark">ST</span><div><strong>Skitrace</strong><small>Trace Skills to Evidence</small></div></div>
    <nav aria-label="Workspace" className="workspace-nav">
      {(['overview', 'jobs', 'candidates'] as const).map(view => <button key={view} aria-current={(activeView === view || view === 'candidates' && activeView === 'candidate-detail') ? 'page' : undefined} onClick={() => setActiveView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}
      <button aria-current={activeView === 'evidence' ? 'page' : undefined} onClick={() => setActiveView('evidence')}>Evidence Explorer</button>
      <button aria-current={activeView === 'graph' ? 'page' : undefined} onClick={() => setActiveView('graph')}>Knowledge Graph</button>
    </nav>
    <div className="demo-identity"><UserButton/><strong>{user?.full_name}</strong><small>{user?.roles.map(role=>role.replaceAll('_',' ')).join(', ')}</small>{hasRole('hr_admin')&&<span>Admin controls</span>}</div>
  </aside>
}
