from datetime import date
import pytest
from backend.models import ResumeClaim, EvidenceRecord, EvidenceProvenance
from backend.services.requirement_extractor import convert
from backend.services.requirement_matcher import *

def claim(text='Built React.js services',state='unverified',id='c'):
    return ResumeClaim(id=id,candidate_id='C',claim_text=text,section='Projects',extraction_trigger='Built',provenance='synthetic',verification_state=state)
def record(skill='ReactJS',weight=3):
    return EvidenceRecord(id='e',candidate_id='C',skill=skill,source_type='interview_feedback',source_url='https://example.test',observation='Synthetic observation',base_weight=weight,recency_multiplier=1,computed_weight=weight,reference_date=date(2026,10,26),provenance=EvidenceProvenance.SYNTHETIC)
def test_claim_matching_excludes_contradictions():
    req=convert('React','r')
    assert match_claims_to_requirement(req,[claim(),claim('Built Python','unverified','other'),claim(state='contradicted',id='bad')])==(['c'],.5)
    assert match_claims_to_requirement(req,[])==([],0)
    assert match_claims_to_requirement(req,[claim('Built Python')])==([],0)
    assert match_claims_to_requirement(req,[claim(state='supported')])==(['c'],1)
    tagged=claim('Built interfaces').model_copy(update={'skill':'ReactJS'})
    assert match_claims_to_requirement(req,[tagged])==(['c'],1)
def test_evidence_alias_negative_and_cap():
    req=convert('React','r')
    assert match_evidence_to_requirement(req,[record()])==(['e'],1/3)
    assert match_evidence_to_requirement(req,[record(weight=0)])==(['e'],0)
    assert match_evidence_to_requirement(req,[record(weight=20)])==(['e'],1)
    assert match_evidence_to_requirement(req,[record(skill='Python')])==([],0)
@pytest.mark.parametrize('claim_ratio,strength,expected',[(0,0,'not_assessed'),(.0001,0,'insufficient_evidence'),(0,.0001,'insufficient_evidence'),(PARTIAL_CLAIM-.00001,0,'insufficient_evidence'),(PARTIAL_CLAIM,0,'partially_supported'),(0,PARTIAL_EVIDENCE-.00001,'insufficient_evidence'),(0,PARTIAL_EVIDENCE,'partially_supported'),(MATCHED_CLAIM-.00001,MATCHED_EVIDENCE,'partially_supported'),(MATCHED_CLAIM,MATCHED_EVIDENCE-.00001,'partially_supported'),(MATCHED_CLAIM,MATCHED_EVIDENCE,'matched'),(1,1,'matched'),(1,0,'partially_supported'),(0,1,'partially_supported')])
def test_boundaries(claim_ratio,strength,expected):
    assert classify_coverage(claim_ratio,strength)==expected
@pytest.mark.parametrize('state',list(CoverageState))
def test_observations(state):
    text=generate_observation(convert('React','r'),state,2,3)
    assert 'React' in text and 'Frontend' in text and '2 claims' in text and '3 observations' in text
