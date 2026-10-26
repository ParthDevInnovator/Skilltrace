"""Deterministic extraction of reported claims, without verification."""
import re
from collections.abc import Sequence
from backend.models import ResumeClaim, ClaimSection

DEFAULT_ACTION_VERBS = ("Designed", "Built", "Led", "Engineered", "Implemented", "Deployed", "Optimized", "Architected", "Reduced", "Increased", "Developed", "Maintained")
DEFAULT_SKILLS = ("Distributed Systems", "Design Systems", "Machine Learning", "Apache Kafka", "TypeScript", "JavaScript", "PostgreSQL", "Kubernetes", "Terraform", "FastAPI", "Python", "React", "Docker", "Neo4j", "AWS", "SQL", "Go", "Rust", "Java", "C++")
HEADINGS = {"experience": ClaimSection.EXPERIENCE, "work experience": ClaimSection.EXPERIENCE,
            "professional experience": ClaimSection.EXPERIENCE, "projects": ClaimSection.PROJECTS,
            "selected projects": ClaimSection.PROJECTS, "education": ClaimSection.EDUCATION}


def extract_claims(raw_text: str, candidate_id: str, *, action_verbs: Sequence[str] = DEFAULT_ACTION_VERBS,
                   skill_keywords: Sequence[str] = DEFAULT_SKILLS) -> list[ResumeClaim]:
    section = ClaimSection.UNKNOWN
    claims = []
    seen = set()
    for line in raw_text.splitlines():
        heading = line.strip().rstrip(":").casefold()
        if heading in HEADINGS:
            section = HEADINGS[heading]
            continue
        # Non-claim headings reset context rather than inheriting an unrelated section.
        if heading in {"skills", "summary", "profiles", "certifications", "contact"}:
            section = ClaimSection.UNKNOWN
            continue
        bullet = re.match(r"^\s*(?:[-*\u2022]|\d+[.)])\s+(.+)$", line)
        if not bullet:
            continue
        text = bullet.group(1).strip()
        normalized = " ".join(text.split()).casefold()
        if normalized in seen:
            continue
        verb = next((verb for verb in action_verbs if re.search(rf"(?<!\w){re.escape(verb)}(?!\w)", text, re.I)), None)
        skill = next((skill for skill in sorted(skill_keywords, key=len, reverse=True)
                      if re.search(rf"(?<!\w){re.escape(skill)}(?!\w)", text, re.I)), None)
        if not verb or not skill:
            continue
        claims.append(ResumeClaim(candidate_id=candidate_id, claim_text=text,
                                 extraction_trigger=verb, section=section, skill=skill,
                                 provenance="Rule-based bullet extraction: action verb and skill keyword"))
        seen.add(normalized)
        if len(claims) == 20:
            break
    return claims
