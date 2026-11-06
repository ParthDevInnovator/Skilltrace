import { useJob } from '@/context/JobContext'
export function TalentDiscoveryView() {
  const { setActiveView } = useJob()
  return <section className="page-stack"><h1>Talent Discovery</h1><article className="panel"><h2>Natural-language discovery is not available yet</h2><p>Use candidate search, reported-skill filters and job-specific ranking to explore the existing talent pool.</p><button className="primary-button" onClick={() => setActiveView('talent-pool')}>Search Talent Pool</button></article></section>
}
