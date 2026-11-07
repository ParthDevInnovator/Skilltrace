import { useEffect, useState } from 'react'
import { JobProvider, useJob } from '@/context/JobContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { DashboardOverview } from '@/components/dashboard/DashboardOverview'
import { CandidateProfileShell } from '@/components/profile/CandidateProfileShell'
import { JobsView } from '@/components/dashboard/JobsView'
import { JobDetailWorkspace } from '@/components/dashboard/JobDetailWorkspace'
import { AddCandidatesView } from '@/components/dashboard/AddCandidatesView'
import { PipelineAnalysisView } from '@/components/dashboard/PipelineAnalysisView'
import { EvidenceExplorer } from '@/components/evidence/EvidenceExplorer'
import { TalentPoolView } from '@/components/dashboard/TalentPoolView'
import { TalentDiscoveryView } from '@/components/dashboard/TalentDiscoveryView'
import { CandidateComparisonView } from '@/components/dashboard/CandidateComparisonView'
import { CustomJDModal } from '@/components/dashboard/CustomJDModal'
import { ChatDrawer } from '@/components/agent/ChatDrawer'
import { GraphVisualization } from '@/components/graph/GraphVisualization'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ClerkIdentity } from '@/context/ClerkIdentity'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { GoogleLoginPage as LoginPage, GoogleSSOCallback } from '@/pages/GoogleLogin'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

function WorkspaceContent() {
  const { activeView, selectedCandidateId } = useJob()
  const [isCustomJDModalOpen, setIsCustomJDModalOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [syntheticData, setSyntheticData] = useState(false)
  useEffect(()=>{const show=()=>setSyntheticData(true);window.addEventListener('mosaic:synthetic-data',show);return()=>window.removeEventListener('mosaic:synthetic-data',show)},[])

  return (
    <div className="w-full min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar />
      <div className="workspace-content flex flex-col min-h-screen">
        <Header onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} onOpenChat={() => setIsChatOpen(true)} />
        {syntheticData&&<div role="status" className="synthetic-banner">Synthetic demo data is included in this view.</div>}
        <main id="main-content" tabIndex={-1} className="workspace-main flex-1">
          {activeView === 'candidate-detail' ? (
            <CandidateProfileShell key={selectedCandidateId} />
          ) : activeView === 'job-detail' ? (
            <JobDetailWorkspace />
          ) : activeView === 'add-candidates' ? (
            <AddCandidatesView />
          ) : activeView === 'pipeline' ? (
            <PipelineAnalysisView />
          ) : activeView === 'graph' ? (
            <GraphVisualization candidateId={selectedCandidateId} />
          ) : activeView === 'evidence' ? (
            <EvidenceExplorer />
          ) : activeView === 'jobs' ? (
            <JobsView onCreate={() => setIsCustomJDModalOpen(true)} />
          ) : activeView === 'talent-pool' || activeView === 'candidates' ? (
            <TalentPoolView />
          ) : activeView === 'talent-discovery' ? (
            <TalentDiscoveryView />
          ) : activeView === 'comparison' ? (
            <CandidateComparisonView />
          ) : (
            <DashboardOverview onOpenCustomJDModal={() => setIsCustomJDModalOpen(true)} />
          )}
        </main>
      </div>

      <CustomJDModal
        key={String(isCustomJDModalOpen)}
        isOpen={isCustomJDModalOpen}
        onClose={() => setIsCustomJDModalOpen(false)}
      />
      {isChatOpen && <ChatDrawer onClose={() => setIsChatOpen(false)} />}
    </div>
  )
}

export default function App() {
  const IdentityProvider = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? ClerkIdentity : AuthProvider
  return (
    <BrowserRouter><IdentityProvider><Routes>
      <Route path="/login" element={<LoginPage/>}/><Route path="/403" element={<ForbiddenPage/>}/>
      <Route path="/sso-callback" element={<GoogleSSOCallback/>}/>
      <Route path="/" element={<Navigate replace to="/login"/>}/>
      <Route path="/dashboard/*" element={<ProtectedRoute><JobProvider><WorkspaceContent/></JobProvider></ProtectedRoute>}/>
      <Route path="/candidates/*" element={<ProtectedRoute><JobProvider><WorkspaceContent/></JobProvider></ProtectedRoute>}/>
      <Route path="*" element={<NotFoundPage/>}/>
    </Routes></IdentityProvider></BrowserRouter>
  )
}
