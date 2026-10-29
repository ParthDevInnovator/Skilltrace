from datetime import date,datetime,timezone
import pytest
from backend.models import Job
from backend.models.matching import CoverageState,RequirementCoverage
from backend.services.ranking_engine import compute_final_score,compute_resume_fit,ranking_key
from backend.services.requirement_extractor import requirements_for_job
from backend.services.requirement_matcher import classify_coverage
from backend.services.scoring_engine import compute_recency_multiplier

def test_recency_calendar_boundaries_and_range():
 reference=date(2026,10,29)
 assert compute_recency_multiplier(reference,reference)==1
 assert compute_recency_multiplier(date(2026,4,29),reference)==.7
 assert compute_recency_multiplier(date(2025,10,29),reference)==.7
 assert compute_recency_multiplier(date(2024,10,29),reference)==.4
 assert all(0<=compute_recency_multiplier(value,reference)<=1 for value in [None,date(2030,1,1),date(2020,1,1)])

def test_coverage_classification_contract():
 assert classify_coverage(.8,.8)==CoverageState.MATCHED
 assert classify_coverage(0,0)==CoverageState.NOT_ASSESSED
 assert classify_coverage(.01,.01)==CoverageState.INSUFFICIENT_EVIDENCE

def test_weighted_score_matches_manual_formula():
 job=Job(id='JOB-MATH',title='Math',department='Test',location='Remote',description_raw='Long enough description for weighted score',requirements=[
  {'id':'R1','requirement_text':'Python','is_mandatory':True},{'id':'R2','requirement_text':'Go','is_mandatory':True},{'id':'R3','requirement_text':'Redis','is_mandatory':False}])
 requirements=requirements_for_job(job);values=[1,.5,0]
 coverage=[RequirementCoverage(requirement_id=r.id,coverage_state=CoverageState.MATCHED,coverage_weight=value,evidence_strength=value,observation='x') for r,value in zip(requirements,values)]
 assert compute_resume_fit(coverage,requirements)==pytest.approx((1+.5+0*.5)/2.5)
 assert compute_final_score(.6,.4)==pytest.approx(.5)

def test_stable_tie_key_uses_candidate_id():
 def row(identifier):return type('Row',(),{'candidate_id':identifier,'context_status':'ready','final_score':0,'evidence_strength':0,'resume_fit':0})()
 assert [x.candidate_id for x in sorted([row('CAND-B'),row('CAND-A')],key=ranking_key)]==['CAND-A','CAND-B']
