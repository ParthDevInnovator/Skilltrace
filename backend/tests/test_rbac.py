from types import SimpleNamespace
import httpx
import pytest
from fastapi import HTTPException
from backend.core.dependencies import get_current_user, require_role
from backend.core.roles import ROLE_HIERARCHY, Role
from backend.main import app

def user(role):return SimpleNamespace(id='user',email=f'{role}@example.com',full_name=role,roles=[role],is_active=True)

@pytest.mark.parametrize('held,required,allowed',[
 ('recruiter',Role.recruiter,True),('recruiter',Role.hr_admin,False),
 ('hiring_manager',Role.hiring_manager,True),('hiring_manager',Role.recruiter,False),
 ('hr_admin',Role.recruiter,True),('hr_admin',Role.hiring_manager,True),('hr_admin',Role.hr_admin,True)])
async def test_role_dependency_matrix(held,required,allowed):
 dependency=require_role(required)
 if allowed:assert await dependency(user(held)) is not None
 else:
  with pytest.raises(HTTPException) as error:await dependency(user(held))
  assert error.value.status_code==403

def test_admin_hierarchy_subsumes_every_role():assert ROLE_HIERARCHY[Role.hr_admin]==set(Role)

@pytest.mark.asyncio
async def test_protected_route_authentication_and_admin_denial():
 async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
  assert (await client.get('/api/v1/candidates')).status_code==401
 app.dependency_overrides[get_current_user]=lambda:user('recruiter')
 try:
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
   assert (await client.get('/api/v1/candidates')).status_code==200
   assert (await client.get('/api/v1/admin/audit-logs')).status_code==403
 finally:app.dependency_overrides.clear()
