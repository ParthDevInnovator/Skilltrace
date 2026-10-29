import json
from pathlib import Path
from backend.services.requirement_extractor import extract_requirements
from backend.services.taxonomy import resolve_skill

def test_extraction_precision_and_recall(request):
 samples=json.loads((Path(__file__).parents[1]/'fixtures'/'jd_gold_labels.json').read_text(encoding='utf-8'))
 rows=[];true_positive=extracted_total=gold_total=0
 for index,sample in enumerate(samples,1):
  requirements=extract_requirements(sample['text'],f'GOLD-{index}')
  extracted={resolve_skill(skill) for requirement in requirements for skill in requirement.skill_aliases}
  gold={resolve_skill(skill) for skill in sample['skills']};matched=extracted&gold
  precision=len(matched)/len(extracted) if extracted else 0;recall=len(matched)/len(gold) if gold else 1
  f1=2*precision*recall/(precision+recall) if precision+recall else 0
  rows.append(f"{index:02d} precision={precision:.2f} recall={recall:.2f} f1={f1:.2f}")
  true_positive+=len(matched);extracted_total+=len(extracted);gold_total+=len(gold)
 request.node.add_report_section('call','extraction metrics','\n'.join(rows))
 assert true_positive/extracted_total>=.80
 assert true_positive/gold_total>=.75
