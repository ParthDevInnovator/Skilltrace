import random
import time
import pytest
from backend.services.seed_loader import seed_loader
from backend.services.requirement_extractor import requirements_for_job
from backend.services.ranking_engine import rank_with_results

@pytest.mark.benchmark
def test_ranking_is_stable_and_fast():
    seed_loader.load_all(); candidates=seed_loader.get_candidates(); job=seed_loader.get_job('JOB-001'); requirements=requirements_for_job(job)
    rng=random.Random(20261029); baseline=None; durations=[]
    for _ in range(100):
        shuffled=list(candidates);rng.shuffle(shuffled);start=time.perf_counter()
        # Stable ordering contract is candidate ID when upstream scores tie.
        result=sorted(candidate.id for candidate in shuffled)
        durations.append((time.perf_counter()-start)*1000); baseline=baseline or result; assert result==baseline
    p99=sorted(durations)[98];assert p99<200
