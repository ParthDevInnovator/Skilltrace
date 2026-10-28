import json
import logging
import re
from datetime import date, datetime, timezone
from backend.services.llm.router import generate_with_fallback
from .tools import service, match_for
from .models import CandidateBrief
from .prompts import BRIEF_SYSTEM
from .grounding import source_ids, citations, grounded_text

logger = logging.getLogger(__name__)
MISSING_SECTION = '[Not generated — model did not produce this section.]'
SECTIONS = {'Strengths': 'strengths', 'Evidence Summary': 'evidence_summary',
            'Application History Notes': 'application_history_notes', 'Identified Gaps': 'identified_gaps'}


def ready_context(candidate_id):
    entry = service().registry.get(candidate_id)
    if not entry or entry.status != 'ready' or entry.context is None:
        raise ValueError('Context not ready')
    return entry.context


async def generate_brief(candidate_id: str, job_id: str | None, reference_date: date) -> CandidateBrief:
    context = ready_context(candidate_id)
    data = {'candidate_name': context.candidate.full_name, 'headline': context.candidate.headline,
        'evidence_records': [r.model_dump(mode='json') for r in sorted(context.evidence_records, key=lambda r: (-r.computed_weight, r.id))[:10]],
        'claims': [r.model_dump(mode='json') for r in context.claims],
        'application_history': [r.model_dump(mode='json') for r in context.application_history],
        'interview_feedback': [r.model_dump(mode='json') for r in context.interview_feedback],
        'reference_date': str(reference_date)}
    if job_id:
        data['coverage'] = match_for(candidate_id, job_id, reference_date).model_dump(mode='json')['coverage']
    allowed = source_ids(data)
    text, provider = await generate_with_fallback(json.dumps(data), BRIEF_SYSTEM, temperature=0.0)
    sections = {}
    for title, field in SECTIONS.items():
        match = re.search(r'^## ' + re.escape(title) + r'\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
        if not match:
            logger.warning('Brief missing section=%s', title)
            sections[field] = MISSING_SECTION
        else:
            sections[field] = grounded_text(match.group(1).strip(), allowed)
    return CandidateBrief(candidate_id=candidate_id, job_id=job_id, generated_at=datetime.now(timezone.utc),
        provider_used=provider, **sections, grounding_ids=citations('\n'.join(sections.values()), allowed))
