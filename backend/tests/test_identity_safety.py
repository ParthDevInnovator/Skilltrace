from types import SimpleNamespace
import pytest
from backend.services.agent.models import FailedStatus
from backend.services.agent.tools import current_service,get_candidate_context,lookup_candidate

class Repository:
 def __init__(self):self.rows=[SimpleNamespace(id='CAND-A',full_name='Alex Smith',email='alex.smith@example.com',headline='Engineer',location='A',top_skills=[],resume_path=None,match_preview=None,model_dump=lambda:{'id':'CAND-A','full_name':'Alex Smith','email':'alex.smith@example.com','headline':'Engineer','location':'A','top_skills':[]}),SimpleNamespace(id='CAND-B',full_name='Alex Jones',email='alex.jones@example.com',headline='Engineer',location='B',top_skills=[],resume_path=None,match_preview=None,model_dump=lambda:{'id':'CAND-B','full_name':'Alex Jones','email':'alex.jones@example.com','headline':'Engineer','location':'B','top_skills':[]})]
 def all_candidate_details(self):return self.rows
 def get_candidate(self,identifier):return next((x for x in self.rows if x.id==identifier),None)

@pytest.fixture
def identity_service():
 token=current_service.set(SimpleNamespace(repository=Repository(),registry=SimpleNamespace(get=lambda _:None)))
 yield
 current_service.reset(token)

@pytest.mark.asyncio
async def test_ambiguous_and_empty_identity_queries(identity_service):
 matches=await lookup_candidate(name='Alex');assert {x.id for x in matches}=={'CAND-A','CAND-B'}
 assert await lookup_candidate()==[] and await lookup_candidate(name='')==[]
 assert await lookup_candidate(email='nonexistent@example.com')==[]

@pytest.mark.asyncio
async def test_nonexistent_context_is_failed_status(identity_service):
 result=await get_candidate_context('CAND-NONEXISTENT');assert isinstance(result,FailedStatus) and 'not found' in result.error.lower()
