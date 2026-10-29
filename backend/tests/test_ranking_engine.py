from datetime import date, datetime, timezone
from types import SimpleNamespace
import pytest
from backend.models import Job, JobRequirement, CandidateContext, CandidateDetail
from backend.services.ranking_engine import *
from backend.services.requirement_extractor import convert
from backend.services.match_store import MatchStore
from backend.tests.test_requirement_matcher import claim,record
REF=date(2026,10,26)
def context(id='C'):
    return CandidateContext(candidate=CandidateDetail(id=id,full_name='Test Person',email='test@example.com',headline='Engineer',location='Remote'),claims=[claim().model_copy(update={'candidate_id':id})],evidence_records=[record().model_copy(update={'candidate_id':id,'observation_date':REF})],evidence_score=3,evidence_label='Some',parse_source='stub',reference_date=REF,context_built_at=datetime(2026,10,26,tzinfo=timezone.utc))
def job(id='J',texts=None):
    return Job(id=id,title='Test role',department='Engineering',location='Remote',description_raw='Build reliable services',requirements=[JobRequirement(id=f'{id}-{i}',requirement_text=t) for i,t in enumerate(texts or ['React'])])
def coverage(id='a',weight=1,strength=.4):
    return RequirementCoverage(requirement_id=id,coverage_state='matched',coverage_weight=weight,evidence_strength=strength,observation='synthetic')
def test_weighted_axes():
    reqs=[convert('React','a'),convert('Python','b',False)]
    rows=[coverage(),coverage('b',0,1)]
    assert compute_resume_fit(rows,reqs)==pytest.approx(2/3)
    assert compute_evidence_strength(rows,reqs)==pytest.approx(.6)
    assert compute_resume_fit([coverage(weight=0)],reqs)==0
    assert compute_resume_fit([coverage()],reqs[:1])==1
    assert compute_resume_fit([],[])==compute_evidence_strength([],[])==0
@pytest.mark.parametrize('fit,strength,expected',[(0,0,0),(1,1,1),(.2,.8,.5),(.7,.1,.4)])
def test_formula(fit,strength,expected): assert compute_final_score(fit,strength)==pytest.approx(expected)
@pytest.mark.parametrize('fit,strength',[(-.1,0),(0,-.1),(1.1,0),(0,1.1),(float('nan'),0),(0,float('inf'))])
def test_invalid_scores(fit,strength):
    with pytest.raises(ValueError): compute_final_score(fit,strength)
def test_pipeline_determinism_and_missing():
    contexts={f'C{i}':context(f'C{i}') for i in range(6)}
    before=[c.model_dump_json() for c in contexts.values()]
    results=[rank_candidates(job(),contexts,REF) for _ in range(3)]
    results.append(rank_candidates(job(),dict(reversed(list(contexts.items()))),REF))
    assert len({str([r.model_dump_json() for r in rows]) for rows in results})==1
    assert before==[c.model_dump_json() for c in contexts.values()]
    rows=rank_candidates(job(),{'building':None,**contexts,'failed':SimpleNamespace(status='failed',context=None)},REF)
    assert [r.candidate_id for r in rows[-2:]]==['building','failed']
    assert all(r.final_score==0 and all(c.coverage_state=='not_assessed' for c in r.coverage) for r in rows[-2:])
def test_one_failure_does_not_abort(monkeypatch):
    import backend.services.ranking_engine as engine
    original=engine.build_match
    def build(j,id,c,d):
        if id=='bad' and c is not None: raise ValueError('synthetic')
        return original(j,id,c,d)
    monkeypatch.setattr(engine,'build_match',build)
    rows=rank_candidates(job(),{'bad':context('bad'),'good':context('good')},REF)
    assert rows[0].candidate_id=='good' and rows[1].final_score==0

def test_sort_key_tie_breakers():
    def row(id,fit,strength): return SimpleNamespace(context_status='ready',candidate_id=id,resume_fit=fit,evidence_strength=strength,final_score=.5)
    rows=[row('z',.8,.2),row('b',.2,.8),row('a',.2,.8),row('c',.3,.8)]
    assert [r.candidate_id for r in sorted(rows,key=ranking_key)]==['c','a','b','z']
def test_similar_overlap_union_cap():
    source=job('source',['React','Python'])
    others=[job(f'J{i}',['React','SQL']) for i in range(7)]
    rows=find_similar_jobs(source,[source,*reversed(others)])
    assert len(rows)==5 and [r.job_id for r in rows]==[f'J{i}' for i in range(5)]
    assert rows[0].shared_requirement_count==1 and rows[0].overlap_ratio==pytest.approx(1/3)
    assert rows[0].overlapping_requirements==['React']
def test_match_store_dates_revisions_and_copies():
    store=MatchStore(); result=build_match(job(),'C',context(),REF)
    store.store_result(result,'rev')
    assert store.get_result('J','C',date(2026,10,27)) is None
    assert store.get_result('J','C',REF,'other') is None
    snapshot=store.get_result('J','C',REF,'rev'); snapshot.coverage.clear()
    assert store.get_result('J','C',REF).coverage
    assert len(store.get_ranked_list('J',REF))==1
    store.clear_job('J'); assert store.get_ranked_list('J',REF)==[]
def test_reference_date_recomputes_recency():
    young=build_match(job(),'C',context(),REF)
    old=build_match(job(),'C',context(),date(2030,10,26))
    assert young.evidence_strength>old.evidence_strength

def test_match_timestamp_is_utc_and_scores_are_validated():
    from pydantic import ValidationError
    result=build_match(job(),'C',context(),REF)
    payload=result.model_dump()
    payload['result_built_at']='2026-10-26T15:00:00+05:30'
    assert CandidateMatchResult.model_validate(payload).result_built_at.isoformat()=='2026-10-26T09:30:00+00:00'
    for invalid in [-1,2,float('nan')]:
        with pytest.raises(ValidationError):
            CandidateMatchResult.model_validate({**payload,'final_score':invalid})
