from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.models.db import (ApplicationHistory, AuditLog, Base, Candidate, ChatHistory,
    EvidenceRecord, InterviewFeedback, Job, JobRequirement, MatchResult, ResumeClaim, User)


@pytest.fixture
async def db():
    engine=create_async_engine('sqlite+aiosqlite://',poolclass=StaticPool)
    @event.listens_for(engine.sync_engine,'connect')
    def foreign_keys(connection, _): connection.execute('PRAGMA foreign_keys=ON')
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    session=async_sessionmaker(engine,expire_on_commit=False)()
    try: yield session
    finally: await session.close();await engine.dispose()


async def test_model_crud_and_candidate_cascades(db):
    user=User(email='db@example.com',hashed_password='hash',full_name='DB User',roles=['hr_admin'])
    candidate=Candidate(id='CAND-DB',full_name='Database Candidate',headline='Engineer',email='db.candidate@example.com',location='Pune')
    job=Job(id='JOB-DB',title='Engineer',description_raw='A sufficiently detailed database engineering role.',created_by=None)
    db.add_all([user,candidate,job]);await db.flush();job.created_by=user.id
    db.add_all([
      JobRequirement(id='REQ-DB',job_id=job.id,skill='Python',level='required',weight=1),
      ResumeClaim(id='CLM-DB',candidate_id=candidate.id,skill='Python',source='resume',verification_state='verified',computed_weight=1),
      EvidenceRecord(id='EVI-DB',candidate_id=candidate.id,skill='Python',source_url=None,summary='Public work',computed_weight=1),
      MatchResult(candidate_id=candidate.id,job_id=job.id,overall_score=.8,coverage_json=[]),
      ApplicationHistory(candidate_id=candidate.id,company='Example',role_title='Engineer',outcome='hired',start_date=date(2024,1,1)),
      InterviewFeedback(candidate_id=candidate.id,interviewer='Interviewer',sentiment='positive',notes='Strong'),
      ChatHistory(session_id='session-db',user_id=user.id,candidate_id=candidate.id,role='user',content='Show candidate'),
      AuditLog(user_id=user.id,role_snapshot='hr_admin',endpoint='/candidates/CAND-DB',method='GET',candidate_id=candidate.id,action_type='VIEW'),
    ]);await db.commit()
    loaded=await db.get(Candidate,'CAND-DB');loaded.headline='Principal Engineer';await db.commit()
    assert (await db.get(Candidate,'CAND-DB')).headline=='Principal Engineer'
    await db.delete(loaded);await db.commit()
    for model in (ResumeClaim,EvidenceRecord,MatchResult,ApplicationHistory,InterviewFeedback,ChatHistory,AuditLog):
        assert await db.scalar(select(func.count()).select_from(model))==0
    assert await db.get(Job,'JOB-DB') is not None and await db.get(User,user.id) is not None


async def test_every_model_can_be_deleted(db):
    user=User(email='delete@example.com',hashed_password='hash',full_name='Delete User');candidate=Candidate(id='CAND-DEL',full_name='Delete Me',headline='Engineer');job=Job(id='JOB-DEL',title='Role',description_raw='Long enough role description')
    db.add_all([user,candidate,job]);await db.commit()
    await db.delete(job);await db.delete(candidate);await db.delete(user);await db.commit()
    assert await db.get(Job,'JOB-DEL') is None and await db.get(Candidate,'CAND-DEL') is None and await db.get(User,user.id) is None
