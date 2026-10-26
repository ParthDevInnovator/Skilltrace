import { useJob } from '@/context/JobContext'
export function JobStatus() {
  const { isLoadingJobs, jobError, retryJobs } = useJob()
  if (isLoadingJobs) return <p role="status">Loading jobs...</p>
  if (jobError) return <div role="alert" className="notice error">{jobError} <button onClick={retryJobs}>Retry jobs</button></div>
  return null
}
