from datetime import timedelta
from uuid import uuid4
import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from backend.core.database import get_db
from backend.core.security import (TokenExpiredError, TokenInvalidError, create_access_token,
 create_refresh_token, decode_token, hash_password, token_blacklist, verify_password)
from backend.main import app
from backend.models.db import Base
from urllib.parse import parse_qs,urlparse

@pytest.fixture
async def auth_client():
 engine=create_async_engine('sqlite+aiosqlite://',poolclass=StaticPool);sessions=async_sessionmaker(engine,expire_on_commit=False)
 async with engine.begin() as connection:await connection.run_sync(Base.metadata.create_all)
 async def override_db():
  async with sessions() as session:yield session
 app.dependency_overrides[get_db]=override_db
 async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:yield client
 app.dependency_overrides.clear();await engine.dispose()

def test_password_and_token_boundaries():
 hashed=hash_password('Correct horse battery staple');assert verify_password('Correct horse battery staple',hashed);assert not verify_password('wrong',hashed)
 token=create_access_token('user-1',['recruiter']);payload=decode_token(token);assert payload['sub']=='user-1' and payload['roles']==['recruiter'] and payload['exp']>payload['iat']
 with pytest.raises(TokenExpiredError):decode_token(create_access_token('user-1',[],timedelta(seconds=-1)))
 with pytest.raises(TokenInvalidError):decode_token(token+'tampered')

@pytest.mark.asyncio
async def test_register_login_refresh_me_logout(auth_client):
 email=f'{uuid4()}@example.com';body={'email':email,'password':'StrongPass123!','full_name':'Auth User'}
 assert (await auth_client.post('/api/v1/auth/register',json=body)).status_code==201
 assert (await auth_client.post('/api/v1/auth/register',json=body)).status_code==409
 assert (await auth_client.post('/api/v1/auth/login',json={**body,'password':'wrong'})).status_code==401
 login=await auth_client.post('/api/v1/auth/login',json={'email':email,'password':body['password']});assert login.status_code==200
 pair=login.json();headers={'Authorization':f"Bearer {pair['access_token']}"}
 assert (await auth_client.get('/api/v1/auth/me',headers=headers)).json()['full_name']=='Auth User'
 refreshed=await auth_client.post('/api/v1/auth/refresh',json={'refresh_token':pair['refresh_token']});assert refreshed.status_code==200
 assert (await auth_client.post('/api/v1/auth/logout',headers=headers)).status_code==204
 assert (await auth_client.get('/api/v1/auth/me',headers=headers)).status_code==401

@pytest.mark.asyncio
async def test_expired_and_blacklisted_refresh_are_rejected(auth_client):
 expired=create_access_token('user',[],timedelta(seconds=-1));assert (await auth_client.get('/api/v1/auth/me',headers={'Authorization':f'Bearer {expired}'})).status_code==401
 refresh=create_refresh_token('user');token_blacklist.blacklist_token(decode_token(refresh)['jti'])
 assert (await auth_client.post('/api/v1/auth/refresh',json={'refresh_token':refresh})).status_code==401

@pytest.mark.asyncio
async def test_google_oauth_authorize_callback_upserts_user(auth_client,monkeypatch):
 from backend.config import settings
 monkeypatch.setattr(settings,'OAUTH_PROVIDER','google');monkeypatch.setattr(settings,'OAUTH_CLIENT_ID','client-id');monkeypatch.setattr(settings,'OAUTH_CLIENT_SECRET',type(settings.JWT_SECRET)('client-secret'));monkeypatch.setattr(settings,'OAUTH_REDIRECT_URI','http://test/api/v1/auth/oauth/callback')
 authorize=await auth_client.get('/api/v1/auth/oauth/authorize',follow_redirects=False);assert authorize.status_code in (302,307)
 state=parse_qs(urlparse(authorize.headers['location']).query)['state'][0]
 class Reply:
  def __init__(self,data):self.data=data
  def raise_for_status(self):return None
  def json(self):return self.data
 class Client:
  async def __aenter__(self):return self
  async def __aexit__(self,*_):return None
  async def post(self,*_,**__):return Reply({'access_token':'provider-token'})
  async def get(self,*_,**__):return Reply({'email':'oauth.user@example.com','name':'OAuth User'})
 monkeypatch.setattr('backend.routers.auth.httpx.AsyncClient',lambda **_:Client())
 callback=await auth_client.get('/api/v1/auth/oauth/callback',params={'code':'valid-code','state':state});assert callback.status_code==200 and callback.json()['access_token']

@pytest.mark.asyncio
async def test_oauth_callback_rejects_unknown_state(auth_client):
 response=await auth_client.get('/api/v1/auth/oauth/callback',params={'code':'code','state':'unknown'});assert response.status_code==400
