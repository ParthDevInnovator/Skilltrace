/** Requirement lists under review in the job wizard and job editor (OI-45). */

/** One requirement being reviewed. `id` is the saved ID when editing an existing job. */
export interface RequirementDraft { key: string; id?: string; requirement_text: string; is_mandatory: boolean }

let nextKey = 0
export const draftKey = () => `draft-${++nextKey}`

/** Drop blanks and case-insensitive duplicates, keeping the first occurrence. */
export function dedupeDrafts(drafts: RequirementDraft[]) {
  const seen = new Set<string>()
  return drafts.filter(draft => {
    const key = draft.requirement_text.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The list exactly as it will be scored; the server assigns final IDs to new entries. */
export function toRequestRequirements(drafts: RequirementDraft[]) {
  return dedupeDrafts(drafts).map((draft, index) => ({
    id: draft.id ?? `draft-${index + 1}`, requirement_text: draft.requirement_text.trim(), category: null, is_mandatory: draft.is_mandatory,
  }))
}
