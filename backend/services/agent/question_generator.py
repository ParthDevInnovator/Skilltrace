import json
import logging
import re
from datetime import date, datetime, timezone
from pydantic import ValidationError
from backend.services.llm.router import generate_with_fallback
from .tools import match_for
from .brief_generator import ready_context
from .models import InterviewQuestion, InterviewQuestionSet
from .prompts import QUESTIONS_SYSTEM
from .grounding import parse_json, ID_PATTERN

logger = logging.getLogger(__name__)


async def generate_interview_questions(candidate_id: str, job_id: str, reference_date: date) -> InterviewQuestionSet:
    if not job_id:
        raise ValueError('job_id required')
    context = ready_context(candidate_id)
    match = match_for(candidate_id, job_id, reference_date)
    targets = [{'source_id': c.id, 'target_type': 'unverified_claim', 'data': c.model_dump(mode='json')}
               for c in context.claims if c.verification_state == 'unverified']
    targets += [{'source_id': c.requirement_id, 'target_type': 'coverage_gap', 'data': c.model_dump(mode='json')}
                for c in match.coverage if c.coverage_state in ('not_assessed', 'insufficient_evidence')]
    # Feedback has no sentiment field. Only explicit negative wording qualifies;
    # attach a real skill-related claim/requirement rather than inventing an ID.
    for feedback in context.interview_feedback:
        if re.search(r'\b(struggled|failed|unable|insufficient|weak|concern)\b', feedback.feedback, re.I):
            claim = next((c for c in context.claims if feedback.skill and c.skill == feedback.skill), None)
            if claim:
                targets.append({'source_id': claim.id, 'target_type': 'history_probe', 'data': feedback.model_dump(mode='json')})
    text, provider = await generate_with_fallback(json.dumps({'targets': targets}), QUESTIONS_SYSTEM, temperature=0.0)
    valid = {(t['source_id'], t['target_type']) for t in targets}
    ids = {t['source_id'] for t in targets}
    questions, warnings = [], []
    try:
        items = parse_json(text)
        if not isinstance(items, list):
            raise ValueError('Expected an array')
        for item in items:
            try:
                question = InterviewQuestion.model_validate(item)
                if (question.source_id, question.target_type) in valid and not (
                    set(ID_PATTERN.findall(question.question_text + ' ' + question.rationale)) - ids
                ) and question not in questions:
                    questions.append(question)
            except ValidationError:
                logger.warning('Invalid interview question omitted')
    except (ValueError, TypeError):
        logger.warning('Interview question response was not a JSON array')
        warnings = ['warning: invalid question JSON']
    return InterviewQuestionSet(candidate_id=candidate_id, job_id=job_id, generated_at=datetime.now(timezone.utc),
        provider_used=provider, questions=questions[:10], grounding_ids=sorted({q.source_id for q in questions[:10]}) + warnings)
