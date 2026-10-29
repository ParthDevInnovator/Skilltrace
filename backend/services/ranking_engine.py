"""Pure ranking. Build timestamps derive from the supplied context, never a clock."""
import logging
from datetime import date, datetime, time, timezone
from backend.models import CandidateContext, EvidenceLabel, Job
from backend.models.matching import ExtractedRequirement, CandidateMatchResult, RankedCandidate, RequirementCoverage, CoverageState, SimilarJob
from backend.services.requirement_extractor import requirements_for_job
from backend.services.requirement_matcher import match_claims_to_requirement, match_evidence_to_requirement, classify_coverage, generate_observation, COVERAGE_WEIGHTS
from backend.services.scoring_engine import compute_recency_multiplier, score_evidence
logger = logging.getLogger(__name__)


def weighted(coverage_list, requirements, field):
    values = {c.requirement_id: getattr(c, field) for c in coverage_list}
    denominator = sum(1 if r.is_mandatory else .5 for r in requirements)
    return sum(values.get(r.id,0) * (1 if r.is_mandatory else .5) for r in requirements)/denominator if denominator else 0.


def compute_resume_fit(coverage_list: list[RequirementCoverage], requirements: list[ExtractedRequirement]) -> float:
    return weighted(coverage_list,requirements,'coverage_weight')


def compute_evidence_strength(coverage_list: list[RequirementCoverage], requirements: list[ExtractedRequirement]) -> float:
    return weighted(coverage_list,requirements,'evidence_strength')


def compute_final_score(resume_fit: float, evidence_strength: float) -> float:
    if not (0 <= resume_fit <= 1 and 0 <= evidence_strength <= 1): raise ValueError('Scores must be finite values in [0, 1]')
    return .5*resume_fit + .5*evidence_strength


def build_match(job, candidate_id, context, reference_date):
    requirements = requirements_for_job(job)
    records = []
    if context:
        for record in context.evidence_records:
            multiplier = compute_recency_multiplier(record.observation_date,reference_date)
            records.append(record.model_copy(update={'recency_multiplier':multiplier,'computed_weight':record.base_weight*multiplier,'reference_date':reference_date}))
    coverage = []
    for requirement in requirements:
        claims, ratio = match_claims_to_requirement(requirement,context.claims if context else [])
        evidence, strength = match_evidence_to_requirement(requirement,records)
        state = classify_coverage(ratio,strength)
        coverage.append(RequirementCoverage(requirement_id=requirement.id,coverage_state=state,claim_ids=claims,evidence_record_ids=evidence,coverage_weight=COVERAGE_WEIGHTS[state],evidence_strength=strength,observation=generate_observation(requirement,state,len(claims),len(evidence))))
    fit, strength = compute_resume_fit(coverage,requirements), compute_evidence_strength(coverage,requirements)
    return CandidateMatchResult(candidate_id=candidate_id,job_id=job.id,reference_date=reference_date,resume_fit=fit,evidence_strength=strength,final_score=compute_final_score(fit,strength),coverage=coverage,result_built_at=context.context_built_at if context else datetime.combine(reference_date,time.min,timezone.utc))


def ranking_key(row):
    return (row.context_status != 'ready',-row.final_score,-row.evidence_strength,-row.resume_fit,row.candidate_id)


def rank_with_results(job, contexts, reference_date, candidates=None):
    rows, results = [], []
    for candidate_id, entry in contexts.items():
        context = entry if isinstance(entry,CandidateContext) else getattr(entry,'context',None)
        status = 'ready' if isinstance(entry,CandidateContext) else getattr(entry,'status','building')
        if status != 'ready': context = None
        candidate = context.candidate if context else (candidates or {}).get(candidate_id)
        try:
            result = build_match(job,candidate_id,context,reference_date)
            label = score_evidence(context.evidence_records,reference_date)[1] if context else EvidenceLabel.NO_EVIDENCE
        except Exception:
            logger.exception('Candidate scoring failed: %s',candidate_id)
            status, label = 'failed', EvidenceLabel.NO_EVIDENCE
            result = build_match(job,candidate_id,None,reference_date)
        results.append(result)
        rows.append(RankedCandidate(candidate_id=candidate_id,full_name=candidate.full_name if candidate else candidate_id,headline=candidate.headline if candidate else '',resume_fit=result.resume_fit,evidence_strength=result.evidence_strength,final_score=result.final_score,evidence_label=label,coverage_counts={s:sum(c.coverage_state==s for c in result.coverage) for s in CoverageState},coverage=result.coverage,context_status=status))
    return sorted(rows,key=ranking_key), results


def rank_candidates(job: Job, contexts: dict[str, CandidateContext], reference_date: date) -> list[RankedCandidate]:
    return rank_with_results(job,contexts,reference_date)[0]


def find_similar_jobs(source_job: Job, all_jobs: list[Job]) -> list[SimilarJob]:
    source = {r.normalized_text:r.requirement_text for r in requirements_for_job(source_job)}
    results = []
    for job in all_jobs:
        if job.id == source_job.id: continue
        other = {r.normalized_text for r in requirements_for_job(job)}
        overlap = sorted(source.keys() & other)
        union = source.keys() | other
        results.append(SimilarJob(job_id=job.id,title=job.title,shared_requirement_count=len(overlap),overlapping_requirements=[source[k] for k in overlap],overlap_ratio=len(overlap)/len(union) if union else 0.))
    return sorted(results,key=lambda r:(-r.shared_requirement_count,r.job_id))[:5]
