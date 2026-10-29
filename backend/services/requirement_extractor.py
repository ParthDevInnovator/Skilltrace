"""Rule-based extraction. Structured job requirements ALWAYS bypass text extraction."""
import re
from collections import Counter
from backend.models.matching import ExtractedRequirement
from backend.services.taxonomy import skills_for_requirement, CATEGORIES

def normalize(text):
    return ' '.join(re.sub(r'[^\w\s]', '', text.lower()).split())


def convert(text, id, mandatory=True, category=None):
    skills = skills_for_requirement(text)
    category = category if category in set(CATEGORIES.values()) | {'Other'} else None
    return ExtractedRequirement(id=id, requirement_text=text, normalized_text=normalize(text), skill_aliases=skills, is_mandatory=mandatory, category=category or (Counter(CATEGORIES.get(s,'Other') for s in skills).most_common(1)[0][0] if skills else 'Other'))


def extract_requirements(jd_text: str, job_id: str) -> list[ExtractedRequirement]:
    units = re.split(r'[\n;]+|(?<=[.!?])\s+', jd_text)
    result, seen = [], set()
    for unit in units:
        text = re.sub(r'^\s*(?:[-*\u2022]|\d+[.)])\s*', '', unit).strip()
        key = normalize(text)
        if not key or key in seen or text.endswith(':'):
            continue
        seen.add(key)
        preferred = bool(re.search(r'\b(preferred|nice to have|plus|bonus|ideally|familiarity with)\b', text, re.I))
        result.append(convert(text, '', not preferred))
    if len(result) > 10:
        mandatory = [r for r in result if r.is_mandatory]
        preferred = [r for r in result if not r.is_mandatory]
        result = (mandatory[:5] + preferred + mandatory[5:])[:10]
    return [r.model_copy(update={'id': f'{job_id}-REQ-{i:03d}'}) for i,r in enumerate(result,1)]


def requirements_for_job(job):
    if job.requirements:
        return [convert(r.requirement_text,r.id,r.is_mandatory,r.category) for r in job.requirements]
    return extract_requirements(job.description_raw,job.id)
