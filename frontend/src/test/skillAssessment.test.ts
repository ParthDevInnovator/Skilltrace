import { describe, expect, it } from 'vitest'
import { assessSkills, skillStatus } from '@/types/skills'
import type { EvidenceRecord, ResumeClaim } from '@/types/context'

// OI-12: aliases join on the canonical name; claim state is separate from observations.
const record = (skill: string, canonical_skill: string | null) => ({ id: `E-${skill}`, skill, canonical_skill } as EvidenceRecord)
const claim = (skill: string, canonical_skill: string | null, verification_state: ResumeClaim['verification_state']) =>
  ({ id: `C-${skill}-${verification_state}`, skill, canonical_skill, verification_state } as ResumeClaim)

describe('assessSkills', () => {
  it('joins alias spellings into one canonical skill', () => {
    const skills = assessSkills(['Kafka'], { claims: [], evidence_records: [record('apache-kafka', 'Apache Kafka'), record('Kafka', 'Apache Kafka')] })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({ name: 'Apache Kafka', reported: true })
    expect(skills[0].observations).toHaveLength(2)
    expect(skillStatus(skills[0])).toBe('Demonstrated')
  })

  it('a contradicted claim is shown even when observations exist', () => {
    const [skill] = assessSkills(['Python'], { claims: [claim('Python', 'Python', 'supported'), claim('Python', 'Python', 'contradicted')],
      evidence_records: [record('Python', 'Python')] })
    expect(skillStatus(skill)).toBe('Contradicted')
    expect(skill.observations).toHaveLength(1)
  })

  it('supported claims and plain reported skills are distinguished', () => {
    const skills = assessSkills(['Go', 'Rust'], { claims: [claim('Go', 'Go', 'supported')], evidence_records: [] })
    expect(skills.map(skillStatus)).toEqual(['Supported', 'Unverified'])
  })

  it('evidence for an unreported skill is not presented as reported', () => {
    const [skill] = assessSkills([], { claims: [], evidence_records: [record('k8s', 'Kubernetes')] })
    expect(skill).toMatchObject({ name: 'Kubernetes', reported: false })
  })
})
