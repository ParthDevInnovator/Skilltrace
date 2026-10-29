from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from backend.config import Settings
from backend.core.dependencies import require_role
from backend.core.masking import mask_candidate
from backend.core.permissions import ROUTE_PERMISSIONS
from backend.core.roles import Role
from backend.core.security import TokenBlacklist,decode_token,create_access_token
from backend.core.synthetic import may_include_synthetic

@pytest.mark.parametrize('pattern',[
 'GET /candidates*','POST /candidates/*/context','POST /jd/match*',
 'POST /candidates/*/rank','POST /candidates/*/brief','POST /agent/chat',
 'GET /candidates/*/evidence*','POST /candidates/*/interview-questions',
 'GET /candidates/*/graph','POST /candidates/*/graph-evidence',
 'DELETE /candidates/*','GET /admin/audit-logs','POST /admin/*'])
def test_permission_matrix_has_required_route(pattern):assert pattern in ROUTE_PERMISSIONS and ROUTE_PERMISSIONS[pattern]

@pytest.mark.parametrize('roles,requested,expected',[
 (['hr_admin'],True,True),(['hr_admin'],False,False),(['recruiter'],True,False),
 (['hiring_manager'],True,False),([],True,False)])
def test_synthetic_inclusion_policy(roles,requested,expected):assert may_include_synthetic(roles,requested) is expected

def test_blacklist_is_jti_scoped():
 blacklist=TokenBlacklist();first=decode_token(create_access_token('a',['recruiter']))['jti'];second=decode_token(create_access_token('a',['recruiter']))['jti'];blacklist.blacklist_token(first);assert blacklist.is_blacklisted(first) and not blacklist.is_blacklisted(second)

def test_invalid_oauth_provider_is_rejected():
 with pytest.raises(ValidationError):Settings(_env_file=None,OAUTH_PROVIDER='unknown')

def test_production_rejects_development_jwt_secret():
 with pytest.raises(ValidationError):Settings(_env_file=None,ENVIRONMENT='production',JWT_SECRET='development-only-change-me-at-least-32-bytes')

def test_hiring_manager_mask_does_not_leak_pii():
 row=SimpleNamespace(model_dump=lambda mode=None:{'email':'secret@example.com','location':'Secret','full_name':'Person'})
 result=mask_candidate(row,Role.hiring_manager);assert 'secret@example.com' not in str(result) and 'Secret' not in str(result)
