import httpx
import pytest
from backend.main import app
from backend.tests.test_context_api import api_service
from backend.tests.test_context_builder import NOW

@pytest.mark.asyncio
@pytest.mark.parametrize('prefix',['/api/v1',''])
async def test_matching_contracts(api_service,prefix,monkeypatch):
    service,_=api_service
    service.start_all(); await service.drain()
    from backend.services.ranking_engine import rank_candidates
    contexts={c.id:service.registry.get(c.id).context for c in service.repository.all_candidate_details()}
    job=service.repository.get_job('JOB-001')
    baseline=[r.model_dump_json() for r in rank_candidates(job,contexts,NOW.date())]
    assert baseline==[r.model_dump_json() for r in rank_candidates(job,dict(reversed(list(contexts.items()))),NOW.date())]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        url=prefix+'/jd'
        structured=await client.post(url+'/extract',json={'job_id':'JOB-001','jd_text':'ignored'})
        assert structured.status_code==200 and len(structured.json())==5
        text='\n'.join(['Must build Python services for enterprise customers','Required React.js frontend experience','Essential Kubernetes infrastructure operations','Postgres database experience preferred','Kafka streaming experience is a plus','Familiarity with machine learning'])
        custom=await client.post(url+'/extract',json={'jd_text':text})
        assert len(custom.json())==6
        for body,code in [({},422),({'jd_text':'short'},422),({'job_id':'missing'},404)]:
            assert (await client.post(url+'/extract',json=body)).status_code==code
        body={'job_id':'JOB-001','reference_date':str(NOW.date())}
        runs=[(await client.post(url+'/rank',json=body)).content for _ in range(3)]
        assert len(set(runs))==1
        rows=(await client.post(url+'/rank',json=body)).json()
        assert len(rows)==6 and [r['final_score'] for r in rows]==sorted([r['final_score'] for r in rows],reverse=True)
        match=await client.post(prefix+'/candidates/CAND-001/jd-match',json=body)
        assert match.status_code==200 and len(match.json()['coverage'])==5
        assert (await client.post(prefix+'/candidates/CAND-001/jd-match',json=body)).json()==match.json()
        assert (await client.post(prefix+'/candidates/missing/jd-match',json=body)).status_code==404
        assert (await client.post(prefix+'/candidates/CAND-001/jd-match',json={'job_id':'missing'})).status_code==404
        similar=(await client.post(url+'/similar',json=body)).json()
        assert len(similar)==4
        assert [r['shared_requirement_count'] for r in similar]==sorted([r['shared_requirement_count'] for r in similar],reverse=True)
        revision=service.reserve('CAND-001')
        assert (await client.post(prefix+'/candidates/CAND-001/jd-match',json=body)).status_code==202
        rows=(await client.post(url+'/rank',json=body)).json()
        assert rows[-1]['candidate_id']=='CAND-001' and rows[-1]['context_status']=='building'
        service.registry.finish('CAND-001',revision,error='synthetic failure')
        assert (await client.post(prefix+'/candidates/CAND-001/jd-match',json=body)).status_code==503
        for route in ['rank','similar']:
            assert (await client.post(url+'/'+route,json={'job_id':'missing'})).status_code==404
        assert (await client.post(url+'/rank',json={'job_id':'JOB-001','reference_date':'nonsense'})).status_code==422

@pytest.mark.asyncio
async def test_custom_job_can_rank_and_extract(api_service):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        created=await client.post('/api/v1/jobs',json={'title':'Custom role','department':'Engineering','location':'Remote','description_raw':'Must build Python services. React.js is preferred for frontend work.'})
        assert created.status_code==201
        id=created.json()['id']
        extracted=await client.post('/jd/extract',json={'job_id':id})
        assert len(extracted.json())==2
        assert (await client.post('/jd/rank',json={'job_id':id})).status_code==200
