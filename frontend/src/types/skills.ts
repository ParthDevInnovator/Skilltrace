import type { CandidateContext, EvidenceRecord, ResumeClaim } from './context'

/**
 * Per-skill assessment shared by the Overview and Comparison screens (OI-12).
 *
 * Skills are joined on the backend's canonical taxonomy name, so "Kafka", "apache-kafka" and
 * "Apache Kafka" are one skill. Claim state (what evidence says about a reported claim) is kept
 * separate from observation availability (whether any public signal mentions the skill).
 */
export type ClaimState = 'contradicted' | 'supported' | 'unverified' | 'not_claimed'
export interface SkillAssessment {
  name: string
  reported: boolean
  claimState: ClaimState
  observations: EvidenceRecord[]
}

const key = (label: string) => label.trim().toLowerCase()

/** Raw label -> canonical name, learned from the claims and records the backend resolved. */
function aliasMap(context: Pick<CandidateContext, 'claims' | 'evidence_records'> | null) {
  const map = new Map<string, string>()
  for (const item of [...(context?.claims ?? []), ...(context?.evidence_records ?? [])] as (ResumeClaim | EvidenceRecord)[]) {
    if (!item.skill || !item.canonical_skill) continue
    map.set(key(item.skill), item.canonical_skill)
    map.set(key(item.canonical_skill), item.canonical_skill)
  }
  return map
}

export function assessSkills(reported: readonly string[], context: Pick<CandidateContext, 'claims' | 'evidence_records'> | null): SkillAssessment[] {
  const aliases = aliasMap(context)
  const nameOf = (label: string, canonical?: string | null) => canonical ?? aliases.get(key(label)) ?? label
  const skills = new Map<string, SkillAssessment>()
  const entry = (name: string) => {
    let found = skills.get(key(name))
    if (!found) skills.set(key(name), found = { name, reported: false, claimState: 'not_claimed', observations: [] })
    return found
  }
  for (const label of reported) entry(nameOf(label)).reported = true
  for (const claim of context?.claims ?? []) {
    if (!claim.skill) continue
    const skill = entry(nameOf(claim.skill, claim.canonical_skill))
    // A contradiction is never hidden by a supported claim or by observations.
    if (claim.verification_state === 'contradicted') skill.claimState = 'contradicted'
    else if (claim.verification_state === 'supported' && skill.claimState !== 'contradicted') skill.claimState = 'supported'
    else if (skill.claimState === 'not_claimed') skill.claimState = 'unverified'
  }
  for (const record of context?.evidence_records ?? []) entry(nameOf(record.skill, record.canonical_skill)).observations.push(record)
  return [...skills.values()]
}

/** Short status: claim state first, then observation availability. */
export function skillStatus(skill: SkillAssessment): 'Contradicted' | 'Supported' | 'Demonstrated' | 'Unverified' | 'Not reported' {
  if (skill.claimState === 'contradicted') return 'Contradicted'
  if (skill.claimState === 'supported') return 'Supported'
  if (skill.observations.length) return 'Demonstrated'
  return skill.reported || skill.claimState === 'unverified' ? 'Unverified' : 'Not reported'
}

export function observationCount(skill: SkillAssessment): string {
  const n = skill.observations.length
  return n ? `${n} supporting observation${n === 1 ? '' : 's'}` : 'No public observations'
}
