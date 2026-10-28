"""Thread-safe, date-scoped snapshots with optional context revision validation."""
from threading import RLock


class MatchStore:
    def __init__(self):
        self._lock = RLock()
        self._results = {}
    def store_result(self, result, revision=None):
        with self._lock:
            self._results[(result.job_id,result.candidate_id,result.reference_date)] = (result.model_copy(deep=True),revision)
    def get_result(self, job_id, candidate_id, reference_date, revision=None):
        with self._lock:
            entry = self._results.get((job_id,candidate_id,reference_date))
            return entry[0].model_copy(deep=True) if entry and (revision is None or revision == entry[1]) else None
    def get_ranked_list(self, job_id, reference_date):
        with self._lock:
            results = [r.model_copy(deep=True) for (j,c,d),(r,rev) in self._results.items() if j==job_id and d==reference_date]
        return sorted(results,key=lambda r:(-r.final_score,-r.evidence_strength,-r.resume_fit,r.candidate_id))
    def clear_job(self, job_id):
        with self._lock:
            self._results = {k:v for k,v in self._results.items() if k[0]!=job_id}
match_store = MatchStore()
store_result = match_store.store_result
get_result = match_store.get_result
get_ranked_list = match_store.get_ranked_list
clear_job = match_store.clear_job
