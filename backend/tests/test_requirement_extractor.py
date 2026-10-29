from backend.services.requirement_extractor import extract_requirements, requirements_for_job
from backend.models import Job, JobRequirement

def test_synthetic_seven_requirements():
    rows=extract_requirements('Must know Python.\nRequired React.js\nEssential k8s\nPostgres preferred\nKafka is a plus\nML nice to have\nIdeally REST API','J')
    assert len(rows)==7
    assert [r.is_mandatory for r in rows]==[True]*3+[False]*4
    assert [r.category for r in rows]==['Backend','Frontend','Cloud','Database','API','Domain','API']
    assert [r.skill_aliases for r in rows]==[['Python'],['React'],['Kubernetes'],['PostgreSQL'],['Apache Kafka'],['Machine Learning'],['REST']]
    assert rows[0].normalized_text=='must know python'
    assert [r.id for r in rows]==[f'J-REQ-{i:03d}' for i in range(1,8)]
def test_cap_and_priority():
    rows=extract_requirements('\n'.join([f'Preferred Python {i}' for i in range(7)]+[f'Must React {i}' for i in range(5)]),'J')
    assert len(rows)==10 and all(r.is_mandatory for r in rows[:5])
def test_three_no_padding_and_dedup():
    assert len(extract_requirements('Python\nReact\nGo','J'))==3
    assert len(extract_requirements('Python!\npython\nPYTHON.','J'))==1
    assert extract_requirements('','J')==[]
def test_all_mandatory_cap():
    assert len(extract_requirements('\n'.join(f'Python {i}' for i in range(12)),'J'))==10
def test_structured_bypass(monkeypatch):
    job=Job(id='J',title='Role',department='Eng',location='Remote',description_raw='Unrelated description',requirements=[JobRequirement(id='original',requirement_text='Python',category='Backend',is_mandatory=False)])
    monkeypatch.setattr('backend.services.requirement_extractor.extract_requirements',lambda *a: (_ for _ in ()).throw(AssertionError('must bypass')))
    row=requirements_for_job(job)[0]
    assert row.id=='original' and not row.is_mandatory
