import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { Job } from '@/types'
import { api } from '@/services/api'

interface JobContextType {
  jobs: Job[]
  selectedJob: Job | null
  setSelectedJob: (job: Job | null) => void
  customJD: string
  setCustomJD: (jd: string) => void
  createCustomJob: (title: string, description: string, department?: string, location?: string) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedSkill: string
  setSelectedSkill: (skill: string) => void
  activeView: 'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence'
  setActiveView: (view: 'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence') => void
  selectedCandidateId: string | null
  openCandidateDetail: (candidateId: string) => void
  backToDashboard: () => void
  isLoadingJobs: boolean
  retryJobs: () => void
  jobError: string | null
}

const JobContext = createContext<JobContextType | undefined>(undefined)

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [customJD, setCustomJD] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedSkill, setSelectedSkill] = useState<string>('')
  const [activeView, setActiveView] = useState<'overview' | 'jobs' | 'candidates' | 'candidate-detail' | 'evidence'>('overview')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true)
  const [jobError, setJobError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const retryJobs = useCallback(() => { setIsLoadingJobs(true); setJobError(null); setReloadKey(k => k + 1) }, [])
  useEffect(() => {
    let cancelled = false
    api.getJobs().then(fetchedJobs => {
      if (cancelled) return
      setJobs(previous => [...previous.filter(job => job.id.startsWith('CUSTOM-')), ...fetchedJobs])
      setSelectedJob(previous => previous || fetchedJobs[0] || null)
    }).catch(() => {
      if (!cancelled) setJobError('Failed to load jobs from server.')
    }).finally(() => { if (!cancelled) setIsLoadingJobs(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  const createCustomJob = (title: string, description: string, department = 'Custom Requisition', location = 'Remote') => {
    const newJob: Job = {
      id: `CUSTOM-${crypto.randomUUID()}`,
      title,
      department,
      location,
      description_raw: description,
      requirements_preview: description.split('\n').filter((l) => l.trim().length > 5).slice(0, 4),
      created_at: new Date().toISOString(),
    }
    setJobs((prev) => [newJob, ...prev])
    setSelectedJob(newJob)
    setCustomJD(description)
  }

  const openCandidateDetail = (candidateId: string) => {
    setSelectedCandidateId(candidateId)
    setActiveView('candidate-detail')
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
        searchQuery,
        setSearchQuery,
        selectedSkill,
        setSelectedSkill,
        activeView,
        setActiveView,
        selectedCandidateId,
        openCandidateDetail,
        backToDashboard,
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
