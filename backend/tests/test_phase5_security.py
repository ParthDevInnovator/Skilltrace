from datetime import timedelta
from uuid import uuid4
import httpx
import pytest
from backend.core.roles import ROLE_HIERARCHY, Role
from backend.core.security import (TokenExpiredError, create_access_token, decode_token,
    hash_password, verify_password)
from backend.main import app

def test_password_jwt_and_role_hierarchy():
    hashed=hash_password('StrongPass123!');assert verify_password('StrongPass123!',hashed);assert not verify_password('wrong',hashed)
    token=create_access_token(str(uuid4()),['recruiter']);assert decode_token(token)['roles']==['recruiter']
    with pytest.raises(TokenExpiredError):decode_token(create_access_token(str(uuid4()),['recruiter'],timedelta(seconds=-1)))
    assert {Role.recruiter,Role.hiring_manager,Role.hr_admin}<=ROLE_HIERARCHY[Role.hr_admin]

@pytest.mark.asyncio
async def test_register_login_me_logout_and_headers():
    email=f"phase5-{uuid4()}@example.com"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        registered=await client.post('/api/v1/auth/register',json={'email':email,'password':'StrongPass123!','full_name':'Phase Five'})
        assert registered.status_code==201
        assert (await client.post('/api/v1/auth/register',json={'email':email,'password':'StrongPass123!','full_name':'Phase Five'})).status_code==409
        login=await client.post('/api/v1/auth/login',json={'email':email,'password':'StrongPass123!'})
        assert login.status_code==200; tokens=login.json(); headers={'Authorization':f"Bearer {tokens['access_token']}"}
        me=await client.get('/api/v1/auth/me',headers=headers);assert me.status_code==200 and me.json()['email']==email
        candidates=await client.get('/api/v1/candidates',headers=headers);assert candidates.status_code==200
        assert candidates.headers['x-content-type-options']=='nosniff' and candidates.headers['x-frame-options']=='DENY'
        assert (await client.post('/api/v1/auth/logout',headers=headers)).status_code==204
        assert (await client.get('/api/v1/auth/me',headers=headers)).status_code==401

@pytest.mark.asyncio
async def test_protected_route_requires_authentication():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        assert (await client.get('/api/v1/candidates')).status_code==401
