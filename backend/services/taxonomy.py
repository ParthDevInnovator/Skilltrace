"""Read-only taxonomy, loaded once. No runtime I/O."""
import json
import re
from pathlib import Path
from types import MappingProxyType
_raw = json.loads((Path(__file__).parents[1] / 'data/taxonomy/skill_aliases.json').read_text())
ALIASES = MappingProxyType({alias.casefold(): canonical for canonical, aliases in _raw.items() for alias in [canonical, *aliases]})
CATEGORIES = MappingProxyType({
    **dict.fromkeys(['Python','Go','FastAPI','Distributed Systems','Java','Spring Boot','C#','.NET','Node.js','Express'], 'Backend'),
    **dict.fromkeys(['JavaScript','TypeScript','React','HTML','CSS'], 'Frontend'),
    **dict.fromkeys(['Kubernetes','Docker','AWS','Terraform','CI/CD','GitHub Actions'], 'Cloud'),
    **dict.fromkeys(['PostgreSQL','SQL','Neo4j','Redis','SQL Server','MongoDB'], 'Database'),
    **dict.fromkeys(['gRPC','REST','Apache Kafka'], 'API'),
    **dict.fromkeys(['Machine Learning','PyTorch','NumPy','Tableau'], 'Domain'),
    'Leadership':'Leadership', 'Domain':'Domain'})


def resolve_skill(text: str) -> str | None:
    return ALIASES.get(text.strip().casefold())


def skills_for_requirement(requirement_text: str) -> list[str]:
    text = requirement_text.casefold()
    # Prefer longer aliases so React.js does not separately match the alias js.
    hits = sorted(((m.start(), m.end(), canonical) for alias, canonical in ALIASES.items() for m in re.finditer(r'(?<!\w)' + re.escape(alias) + r'(?!\w)', text)), key=lambda hit: (-(hit[1]-hit[0]), hit[0]))
    accepted = []
    for hit in hits:
        if not any(hit[0] < end and hit[1] > start for start,end,_ in accepted):
            accepted.append(hit)
    return sorted({canonical for _,_,canonical in accepted})
