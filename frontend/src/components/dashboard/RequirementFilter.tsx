import type { Job } from '@/types'
export function RequirementChips({job}:{job:Job}) {
  return <><div className="skill-list">{job.requirements?.length ? job.requirements.map(r => <span className={`requirement-chip ${r.is_mandatory ? 'mandatory' : 'preferred'}`} key={r.id}>{r.requirement_text} - {r.is_mandatory ? 'Mandatory' : 'Preferred'}</span>) : job.requirements_preview?.map((r,i) => <span className="skill-tag" key={i}>{r}</span>)}</div>{job.extraction_failed && <small>Requirements not extracted.</small>}</>
}
export function RequirementFilter({requirements,selected,onChange}:{requirements:NonNullable<Job['requirements']>;selected:string[];onChange:(ids:string[])=>void}) {
  return <div className="skill-list" aria-label="Filter by requirement">{requirements.map(r => <button className="requirement-chip" aria-pressed={selected.includes(r.id)} key={r.id} onClick={() => onChange(selected.includes(r.id) ? selected.filter(id=>id!==r.id) : [...selected,r.id])}>{r.requirement_text}</button>)}<button onClick={()=>onChange([])}>Clear filters</button></div>
}
