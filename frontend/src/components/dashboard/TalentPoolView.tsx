import { CandidateGrid } from './CandidateGrid'
import { useJob } from '@/context/JobContext'
export function TalentPoolView() {
  const { setActiveView } = useJob()
  return <section className="page-stack"><div className="page-heading"><div><h1>Talent Pool</h1><p>Candidate records and reported skills. Select a job and rank to assess role fit.</p></div><button onClick={() => setActiveView('comparison')}>Compare candidates</button></div><CandidateGrid /></section>
}
