import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Job, JobCreateRequest, JobUpdateRequest } from '@/types'
import { api } from '@/services/api'

interface JobContextType {
  jobs: Job[]
  selectedJob: Job | null
  setSelectedJob: (job: Job | null) => void
  customJD: string
  setCustomJD: (jd: string) => void
  /** Create a job with the exact requirement list the recruiter reviewed (OI-45). */
  createCustomJob: (job: JobCreateRequest) => Promise<Job>
  /** Edit a job or change its status (OI-31); the saved job replaces the cached copy. */
  updateJob: (jobId: string, patch: JobUpdateRequest) => Promise<Job>
  /** Reload one job, e.g. after candidates were added, to refresh its counts (OI-30). */
  refreshJob: (jobId: string) => Promise<void>
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedSkill: string
  setSelectedSkill: (skill: string) => void
  activeView: 'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence' | 'graph' | 'job-detail' | 'add-candidates' | 'pipeline' | 'talent-pool' | 'talent-discovery' | 'comparison' | 'admin-access' | 'admin-records' | 'account'
  setActiveView: (view: 'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence' | 'graph' | 'job-detail' | 'add-candidates' | 'pipeline' | 'talent-pool' | 'talent-discovery' | 'comparison' | 'admin-access' | 'admin-records' | 'account') => void
  startPipeline: (candidateId: string) => void
  selectedCandidateId: string | null
  openCandidateDetail: (candidateId: string) => void
  /** Candidates in the comparison set. Workspace state, so inspecting a profile and coming back keeps the set (OI-16). */
  comparisonIds: string[]
  setComparisonIds: (update: (previous: string[]) => string[]) => void
  /** Add a candidate to the comparison set (max 3) and open the comparison. */
  compareCandidate: (candidateId: string) => void
  backToDashboard: () => void
  jobWorkspaceTab: 'overview' | 'candidates' | 'requirements' | 'comparison' | 'activity'
  setJobWorkspaceTab: (tab: 'overview' | 'candidates' | 'requirements' | 'comparison' | 'activity') => void
  openJobWorkspace: (job: Job, tab?: 'overview' | 'candidates') => void
  isLoadingJobs: boolean
  retryJobs: () => void
  jobError: string | null
}

export const MAX_COMPARISON = 3

const JobContext = createContext<JobContextType | undefined>(undefined)

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [customJD, setCustomJD] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [activeView, setActiveView] = useState<'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence' | 'graph' | 'job-detail' | 'add-candidates' | 'pipeline' | 'talent-pool' | 'talent-discovery' | 'comparison' | 'admin-access' | 'admin-records' | 'account'>(() => window.location.pathname.startsWith('/candidates') ? 'talent-pool' : 'overview')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [comparisonIds, setComparisonIdState] = useState<string[]>([])
  const setComparisonIds = useCallback((update: (previous: string[]) => string[]) => setComparisonIdState(previous => [...new Set(update(previous))].slice(0, MAX_COMPARISON)), [])
  const [jobWorkspaceTab, setJobWorkspaceTab] = useState<'overview' | 'candidates' | 'requirements' | 'comparison' | 'activity'>('overview')
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true)
  const [jobError, setJobError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const retryJobs = useCallback(() => { setIsLoadingJobs(true); setJobError(null); setReloadKey(k => k + 1) }, [])
  useEffect(() => {
    let cancelled = false
    api.getJobs().then(fetchedJobs => {
      if (cancelled) return
      setJobs(fetchedJobs)
      setSelectedJob(previous => previous || fetchedJobs[0] || null)
    }).catch(() => {
      if (!cancelled) setJobError('Failed to load jobs from server.')
    }).finally(() => { if (!cancelled) setIsLoadingJobs(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  const replaceJob = useCallback((saved: Job) => {
    setJobs(previous => previous.some(job => job.id === saved.id) ? previous.map(job => job.id === saved.id ? saved : job) : [saved, ...previous])
    setSelectedJob(previous => previous?.id === saved.id ? saved : previous)
  }, [])

  const createCustomJob = async (request: JobCreateRequest) => {
    // The server's requirement IDs (e.g. CUSTOM-…-REQ-001) are the ones matching and comparison
    // join on, so the saved job replaces what the client sent (OI-09).
    const saved = await api.createJob(request)
    const newJob: Job = { ...saved, requirements: saved.requirements ?? [] }
    setJobs(prev => [newJob, ...prev.filter(job => job.id !== newJob.id)]); setSelectedJob(newJob); setCustomJD(request.description_raw)
    return newJob
  }

  const updateJob = async (jobId: string, patch: JobUpdateRequest) => {
    const saved = await api.updateJob(jobId, patch)
    replaceJob(saved)
    return saved
  }

  const refreshJob = useCallback(async (jobId: string) => {
    try { replaceJob(await api.getJobById(jobId)) } catch { /* counts stay as last loaded */ }
  }, [replaceJob])

  const openCandidateDetail = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setActiveView('candidate-detail')
  }

  const compareCandidate = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setComparisonIds(previous => previous.includes(candidateId) || previous.length >= MAX_COMPARISON ? previous : [...previous, candidateId])
    setActiveView('comparison')
  }

  const openJobWorkspace = (job: Job, tab: 'overview' | 'candidates' = 'overview') => {
    setSelectedJob(job)
    setJobWorkspaceTab(tab)
    setActiveView('job-detail')
  }

  const backToDashboard = () => {
    setSelectedCandidateId(null)
    setActiveView('overview')
  }

  return (
    <JobContext.Provider
      value={{
        jobs,
        selectedJob,
        setSelectedJob,
        customJD,
        setCustomJD,
        createCustomJob,
        updateJob,
        refreshJob,
        searchQuery,
        setSearchQuery,
        selectedSkill,
        setSelectedSkill,
        activeView,
        setActiveView,
        startPipeline: (id: string) => { setSelectedCandidateId(id); setActiveView('pipeline') },
        selectedCandidateId,
        openCandidateDetail,
        comparisonIds,
        setComparisonIds,
        compareCandidate,
        backToDashboard,
        jobWorkspaceTab,
        setJobWorkspaceTab,
        openJobWorkspace,
        isLoadingJobs,
        jobError,
        retryJobs,
      }}
    >
      {children}
    </JobContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- Provider and its hook share one context module.
export function useJob() {
  const ctx = useContext(JobContext)
  if (!ctx) {
    throw new Error('useJob must be used within a JobProvider')
  }
  return ctx
}
