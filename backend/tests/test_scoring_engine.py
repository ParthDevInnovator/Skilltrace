"""Pure scoring checks using fixed dates and controlled synthetic evidence."""
import json
from datetime import date, datetime
from decimal import Decimal, localcontext
from pathlib import Path

import pytest

from backend.models import EvidenceLabel, EvidenceRecord
from backend.services.scoring_engine import (
    compute_recency_multiplier, evidence_label_for_score, score_evidence,
)
from backend.services.signal_fetchers.common import recency_multiplier


REFERENCE = date(2026, 10, 26)
FIXTURES = Path(__file__).resolve().parents[1] / "data" / "fixtures"


def fixture_data(candidate_id="CAND-001"):
    return json.loads((FIXTURES / f"{candidate_id}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("observed,expected", [
    (None, .7), (REFERENCE, 1), (date(2026, 10, 27), .7),
    (date(2026, 4, 27), 1), (date(2026, 4, 26), .7), (date(2026, 4, 25), .7),
    (date(2025, 4, 27), .7), (date(2025, 4, 26), .4), (date(2025, 4, 25), .4),
    (date(2023, 10, 27), .4), (date(2023, 10, 26), .2), (date(2023, 10, 25), .2),
])
def test_recency_exact_boundaries_and_neighbors(observed, expected):
    assert compute_recency_multiplier(observed, REFERENCE) == expected


@pytest.mark.parametrize("reference,observed,expected", [
    (date(2026, 8, 31), date(2026, 2, 28), .7),
    (date(2026, 8, 31), date(2026, 3, 1), 1),
    (date(2024, 8, 31), date(2024, 2, 29), .7),
    (date(1, 1, 1), date(1, 1, 1), 1),
])
def test_calendar_month_end_and_leap_year(reference, observed, expected):
    assert compute_recency_multiplier(observed, reference) == expected


@pytest.mark.parametrize("score,label", [
    (0, "No public evidence"), (.5, "Limited"), (2, "Limited"),
    (2.1, "Some"), (5, "Some"), (5.1, "Good"), (9, "Good"),
    (9.1, "Strong"), (15, "Strong"),
])
def test_continuous_score_tiers(score, label):
    assert evidence_label_for_score(score) == label


@pytest.mark.parametrize("score", [-1, float("nan"), float("inf"), float("-inf")])
def test_invalid_scores_are_rejected(score):
    with pytest.raises(ValueError):
        evidence_label_for_score(score)


@pytest.mark.parametrize("candidate_id", [f"CAND-{i:03d}" for i in range(1, 7)])
def test_fixture_scores_reproduce_without_mutation(candidate_id):
    fixture = fixture_data(candidate_id)
    records = [EvidenceRecord.model_validate(value) for value in fixture["evidence_records"]]
    before = [record.model_dump(mode="json") for record in records]
    expected = (fixture["expected"]["evidence_score"], EvidenceLabel(fixture["expected"]["evidence_label"]))
    results = [score_evidence(records, REFERENCE) for _ in range(3)]
    assert results == [expected] * 3
    assert score_evidence(list(reversed(records)), REFERENCE) == expected
    assert [record.model_dump(mode="json") for record in records] == before


def test_explicit_date_recomputes_cached_weights():
    data = fixture_data()["evidence_records"][0]
    # This valid cached observation was initially scored as recent.
    record = EvidenceRecord.model_validate(data)
    before = record.model_dump()
    score, _ = score_evidence([record], date(2028, 10, 26))
    assert score == 1.2
    assert record.model_dump() == before
    assert score != record.computed_weight


@pytest.mark.parametrize("observed", [None, "2026-08-26", "2026-01-26", "2024-10-26", "2022-10-26"])
def test_negative_feedback_weight_zero_never_penalizes(observed):
    data = fixture_data()["evidence_records"][0]
    multiplier = compute_recency_multiplier(date.fromisoformat(observed) if observed else None, REFERENCE)
    record = EvidenceRecord.model_validate({
        **data, "source_type": "interview_feedback", "observation": "Synthetic negative feedback",
        "observation_date": observed, "base_weight": 0, "computed_weight": 0,
        "recency_multiplier": multiplier,
    })
    assert score_evidence([record], REFERENCE) == (0.0, EvidenceLabel.NO_EVIDENCE)


def test_decimal_precision_cannot_move_a_tier_boundary():
    data = fixture_data()["evidence_records"][0]
    weights = [1.4, .2, .4]
    records = [EvidenceRecord.model_validate({
        **data, "id": f"synthetic-{index}", "base_weight": weight,
        "computed_weight": weight, "recency_multiplier": 1,
    }) for index, weight in enumerate(weights)]
    assert score_evidence(records, REFERENCE) == (2.0, EvidenceLabel.LIMITED)
    with localcontext() as caller_context:
        caller_context.prec = 1
        caller_context.Emax = 1
        assert score_evidence(records, REFERENCE) == (2.0, EvidenceLabel.LIMITED)
    assert evidence_label_for_score(Decimal("2.0000000000000001")) == EvidenceLabel.SOME


def test_reference_date_is_required_and_fetchers_share_the_implementation():
    assert recency_multiplier is compute_recency_multiplier
    assert score_evidence([], REFERENCE) == (0.0, EvidenceLabel.NO_EVIDENCE)
    with pytest.raises(TypeError):
        compute_recency_multiplier(None)
    with pytest.raises(TypeError):
        score_evidence([])
    with pytest.raises(TypeError):
        score_evidence([], "2026-10-26")
    with pytest.raises(TypeError):
        compute_recency_multiplier(datetime(2026, 1, 26), REFERENCE)
