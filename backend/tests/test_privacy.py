from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
import pytest
from sqlalchemy import func,select
from sqlalchemy.ext.asyncio import async_sessionmaker,create_async_engine
from sqlalchemy.pool import StaticPool
from backend.core.masking import mask_candidate
from backend.core.retention import purge_expired_evidence
from backend.core.roles import Role
from backend.core.synthetic import filter_candidates,may_include_synthetic
from backend.models.db import Base,Candidate,EvidenceRecord

def candidate(**values):return SimpleNamespace(id='CAND-X',full_name='Private Person',headline='Engineer',email='person@example.com',location='Delhi',is_synthetic=False,model_dump=lambda mode=None:{'id':'CAND-X','full_name':'Private Person','headline':'Engineer','email':'person@example.com','location':'Delhi'})

def test_masking_is_serialization_only():
 row=candidate();masked=mask_candidate(row,Role.hiring_manager);assert masked['email']=='***@***.***' and masked['location']=='[Redacted]' and masked['masked_fields']==['email','location'];assert row.email=='person@example.com'
 assert mask_candidate(row,Role.recruiter)['email']=='person@example.com';assert mask_candidate(row,Role.hr_admin)['email']=='person@example.com'

def test_synthetic_policy_is_admin_only():
 real=candidate();demo=candidate();demo.is_synthetic=True
 assert filter_candidates([real,demo],['recruiter'])==[real]
 assert filter_candidates([real,demo],['hr_admin'],True)==[real,demo]
 assert not may_include_synthetic(['recruiter'],True) and may_include_synthetic(['hr_admin'],True)

@pytest.mark.asyncio
async def test_retention_deletes_only_expired_evidence():
 engine=create_async_engine('sqlite+aiosqlite://',poolclass=StaticPool);sessions=async_sessionmaker(engine,expire_on_commit=False)
 async with engine.begin() as connection:await connection.run_sync(Base.metadata.create_all)
 async with sessions() as db:
  db.add(Candidate(id='CAND-TTL',full_name='TTL',headline='Engineer'))
  now=datetime.now(timezone.utc);db.add_all([EvidenceRecord(id='OLD',candidate_id='CAND-TTL',skill='Python',summary='',computed_weight=0,expires_at=now-timedelta(days=1)),EvidenceRecord(id='NEW',candidate_id='CAND-TTL',skill='Go',summary='',computed_weight=0,expires_at=now+timedelta(days=1))]);await db.commit()
  assert await purge_expired_evidence(db)==1
  assert await db.scalar(select(func.count()).select_from(EvidenceRecord))==1 and await db.get(EvidenceRecord,'NEW') is not None
 await engine.dispose()
