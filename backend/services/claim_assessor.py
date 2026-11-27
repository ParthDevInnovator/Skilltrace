"""Automatic claim-to-evidence links, for a recruiter to confirm or dismiss (OI-29).

The pass only *suggests*: `supported_by_evidence` when public observations name the
claimed skill, `possible_contradiction` when a concrete signal conflicts with the claim,
otherwise `no_evidence`. It never sets `verification_state`; only a recruiter's
confirmation does (see `apply_review`).

Missing public evidence is never treated as a contradiction. Contradictions come only from:
- interview feedback about the claimed skill that uses explicit negative wording, and
- a claim that names a public repository whose metadata (language and topics) does not
  include the claimed skill.
"""
import re
from collections.abc import Iterable, Mapping
from urllib.parse import urlparse

from backend.models.context import (
    ClaimEvidenceLink, ClaimReview, ClaimReviewDecision, ClaimVerificationState,
    EvidenceProvenance, EvidenceRecord, EvidenceSourceType, InterviewFeedback, ResumeClaim,
)
from backend.services.taxonomy import canonical_skill

NEGATIVE_FEEDBACK = re.compile(r"\b(struggled|failed|unable|insufficient|weak|concern)\b", re.I)
# Repository names shorter than this match too many ordinary words in a claim.
MIN_REPO_NAME_LENGTH = 4


def _skill_key(label: str | None, canonical: str | None = None) -> str | None:
    name = canonical or canonical_skill(label) or (label.strip() if label and label.strip() else None)
    return name.casefold() if name else None


def _is_support(record: EvidenceRecord) -> bool:
    # The LinkedIn stub is a fixture, not public evidence; negative feedback (weight 0) is not support.
    if record.provenance == EvidenceProvenance.LINKEDIN_STUB:
        return False
    return not (record.source_type == EvidenceSourceType.INTERVIEW_FEEDBACK and record.base_weight == 0)


def _repo_name(url: str) -> str | None:
    parts = [part for part in urlparse(url).path.split("/") if part]
    return parts[1] if len(parts) >= 2 else None


def _mentions(text: str, name: str) -> bool:
    if len(name) < MIN_REPO_NAME_LENGTH:
        return False
    variants = {name, re.sub(r"[-_.]+", " ", name)}
    return any(re.search(rf"(?<![\w-]){re.escape(variant)}(?![\w-])", text, re.I) for variant in variants)


def _repository_conflicts(claim: ResumeClaim, key: str, records: list[EvidenceRecord]) -> tuple[list[str], list[str]]:
    """Repositories named in the claim whose public metadata does not include the claimed skill."""
    repos: dict[str, list[EvidenceRecord]] = {}
    for record in records:
        if record.source_type == EvidenceSourceType.GITHUB and (name := _repo_name(str(record.source_url))):
            repos.setdefault(name, []).append(record)
    ids, reasons = [], []
    for name, repo_records in sorted(repos.items()):
        if not _mentions(claim.claim_text, name):
            continue
        skills = {_skill_key(r.skill, r.canonical_skill) for r in repo_records}
        if key in skills:
            continue
        ids += [r.id for r in repo_records]
        listed = ", ".join(sorted({r.canonical_skill or r.skill for r in repo_records}))
        reasons.append(f"the public repository {name} lists {listed}, not {claim.canonical_skill or claim.skill}")
    return ids, reasons


def assess_claim(claim: ResumeClaim, records: list[EvidenceRecord],
                 feedback: Iterable[InterviewFeedback] = ()) -> ResumeClaim:
    """Return a copy of the claim with its automatic evidence link. Reviews are not touched."""
    key = _skill_key(claim.skill, claim.canonical_skill)
    skill = claim.canonical_skill or claim.skill
    if key is None:
        return claim.model_copy(update={"evidence_link": ClaimEvidenceLink.NO_EVIDENCE,
            "supporting_evidence_ids": [], "conflicting_evidence_ids": [],
            "assessment_reason": "The claim names no skill to compare with public evidence."})

    same_skill = [r for r in records if _skill_key(r.skill, r.canonical_skill) == key]
    supporting = sorted(r.id for r in same_skill if _is_support(r))
    conflicting, reasons = [], []

    negative_records = [r.id for r in same_skill
                        if r.source_type == EvidenceSourceType.INTERVIEW_FEEDBACK and r.base_weight == 0]
    negative_feedback = [f.id for f in feedback
                         if _skill_key(f.skill) == key and NEGATIVE_FEEDBACK.search(f.feedback)]
    if negative_records or negative_feedback:
        conflicting += negative_records + negative_feedback
        reasons.append(f"interview feedback about {skill} raises a concern")

    repo_ids, repo_reasons = _repository_conflicts(claim, key, records)
    conflicting += repo_ids
    reasons += repo_reasons

    if conflicting:
        link = ClaimEvidenceLink.POSSIBLE_CONTRADICTION
        reason = "Possible contradiction: " + "; ".join(reasons) + "."
    elif supporting:
        link = ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE
        count = len(supporting)
        reason = (f"{count} public observation{'s' if count != 1 else ''} mention {skill}. "
                  "This links evidence to the claim; it does not establish who did the work.")
    else:
        link = ClaimEvidenceLink.NO_EVIDENCE
        reason = f"No public observation mentions {skill}. Missing public evidence is not a finding about competence."
    return claim.model_copy(update={"evidence_link": link, "supporting_evidence_ids": supporting,
        "conflicting_evidence_ids": sorted(dict.fromkeys(conflicting)), "assessment_reason": reason})


def assess_claims(claims: list[ResumeClaim], records: list[EvidenceRecord],
                  feedback: Iterable[InterviewFeedback] = ()) -> list[ResumeClaim]:
    feedback = list(feedback)
    return [assess_claim(claim, records, feedback) for claim in claims]


def apply_review(claim: ResumeClaim, review: ClaimReview | None) -> ResumeClaim:
    """Attach a recruiter's decision and derive verification_state from it.

    A review made against a different automatic link (the evidence changed on a rebuild)
    is set aside: the claim goes back to unverified and awaits a fresh review.
    """
    if review is None or review.reviewed_link != claim.evidence_link:
        return claim.model_copy(update={"review": None, "verification_state": ClaimVerificationState.UNVERIFIED})
    state = ClaimVerificationState.UNVERIFIED
    if review.decision == ClaimReviewDecision.CONFIRMED:
        state = {ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE: ClaimVerificationState.SUPPORTED,
                 ClaimEvidenceLink.POSSIBLE_CONTRADICTION: ClaimVerificationState.CONTRADICTED,
                 }.get(review.reviewed_link, ClaimVerificationState.UNVERIFIED)
    return claim.model_copy(update={"review": review, "verification_state": state})


def apply_reviews(claims: list[ResumeClaim], reviews: Mapping[str, ClaimReview]) -> list[ResumeClaim]:
    return [apply_review(claim, reviews.get(claim.id)) for claim in claims]


REVIEWABLE_LINKS = (ClaimEvidenceLink.SUPPORTED_BY_EVIDENCE, ClaimEvidenceLink.POSSIBLE_CONTRADICTION)
