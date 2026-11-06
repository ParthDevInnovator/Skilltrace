import { useJob } from '@/context/JobContext'
import { useCandidateContext } from '@/hooks/useCandidateContext'
import { ContextFeedback } from '@/components/evidence/ContextFeedback'
export function PipelineAnalysisView() {
  const { selectedCandidateId, openCandidateDetail, setActiveView } = useJob()
  const { context, phase, retry } = useCandidateContext(selectedCandidateId)
  return <section className="page-stack"><h1>Candidate processing</h1>{!selectedCandidateId ? <p>No uploaded candidate selected.</p> : <><p>Candidate {selectedCandidateId}</p><ContextFeedback phase={phase} retry={retry} />{context && <article className="panel"><h2>{context.candidate.full_name}</h2><p>Analysis ready. {context.evidence_records.length} attributed observations. Claims remain separately assessed.</p></article>}<button disabled={phase !== 'ready'} onClick={() => openCandidateDetail(selectedCandidateId)}>View Candidate Intelligence Dossier</button></>}<button onClick={() => setActiveView('job-detail')}>Return to job (processing continues)</button></section>
}
