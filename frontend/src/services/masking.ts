/**
 * The server masks contact fields for hiring managers (OI-04) and lists them in `masked_fields`.
 * Masked values are placeholders such as "[Redacted]", so they are never shown or searched as data.
 */
type Maskable = { location?: string | null; email?: string | null; masked_fields?: string[] }

export function isMasked(candidate: Maskable, field: 'location' | 'email') {
  return Boolean(candidate.masked_fields?.includes(field))
}

/** The real location, or null when it is unknown or hidden for this role. */
export function visibleLocation(candidate: Maskable): string | null {
  return isMasked(candidate, 'location') ? null : candidate.location || null
}

/** Text for display: the location, "Location hidden" when masked, or '' when unknown. */
export function locationLabel(candidate: Maskable): string {
  return isMasked(candidate, 'location') ? 'Location hidden' : candidate.location || ''
}
