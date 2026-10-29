import pytest
from backend.services.taxonomy import ALIASES, resolve_skill, skills_for_requirement
@pytest.mark.parametrize('alias,canonical',[('Python','Python'),('pYtHoN','Python'),('React.js','React'),('ReactJS','React'),('k8s','Kubernetes'),('Postgres','PostgreSQL'),('Kafka','Apache Kafka'),('ML','Machine Learning'),('REST API','REST'),('unknown',None)])
def test_resolution(alias,canonical):
    assert resolve_skill(alias)==canonical
def test_multiple_skills_and_read_only():
    before=dict(ALIASES)
    for _ in range(3):
        assert skills_for_requirement('React.js with k8s, Postgres and REST API')==['Kubernetes','PostgreSQL','REST','React']
    assert dict(ALIASES)==before
    with pytest.raises(TypeError): ALIASES['new']='new'
def test_token_boundaries():
    assert skills_for_requirement('Django, ongoing work, NoSQL')==[]
