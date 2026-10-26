"""Pure, deterministic evidence scoring; no I/O, clock, LLM or claim updates."""

import calendar
import math
from collections.abc import Sequence
from datetime import date
from decimal import Context, Decimal, InvalidOperation, localcontext

from backend.models import EvidenceLabel, EvidenceRecord


def compute_recency_multiplier(
    observation_date: date | None, reference_date: date,
) -> float:
    """Use calendar months; exact cutoffs belong to the older bucket.

    Month-end cutoffs clamp to the last existing day in the target month.
    Future observations use the unknown-date multiplier, as fetchers do.
    Both dates are explicit inputs; this function never consults the clock.
    """
    if type(reference_date) is not date:
        raise TypeError("reference_date must be a date")
    if observation_date is not None and type(observation_date) is not date:
        raise TypeError("observation_date must be a date or None")
    if observation_date is None or observation_date > reference_date:
        return 0.7
    for months, multiplier in ((6, 1.0), (18, 0.7), (36, 0.4)):
        ordinal = reference_date.year * 12 + reference_date.month - 1 - months
        year, month = divmod(ordinal, 12)
        month += 1
        if year < 1:
            return multiplier
        cutoff = date(
            year, month,
            min(reference_date.day, calendar.monthrange(year, month)[1]),
        )
        if observation_date > cutoff:
            return multiplier
    return 0.2


def evidence_label_for_score(score: float | Decimal) -> EvidenceLabel:
    """Classify continuous scores without rounding or undefined gaps."""
    try:
        value = Decimal(str(score))
    except (InvalidOperation, ValueError):
        raise ValueError("Evidence score must be finite and nonnegative") from None
    if not value.is_finite() or value < 0:
        raise ValueError("Evidence score must be finite and nonnegative")
    if value == 0:
        return EvidenceLabel.NO_EVIDENCE
    if value <= 2:
        return EvidenceLabel.LIMITED
    if value <= 5:
        return EvidenceLabel.SOME
    if value <= 9:
        return EvidenceLabel.GOOD
    return EvidenceLabel.STRONG


def score_evidence(
    records: Sequence[EvidenceRecord], reference_date: date,
) -> tuple[float, EvidenceLabel]:
    """Recompute weights at reference_date, leaving every input unchanged.

    Cached computed weights and reference dates are deliberately not reused.
    Decimal arithmetic avoids binary-float drift at tier boundaries. A local
    precision context makes results independent of the caller's Decimal setup.
    No score normalization, role-fit inference or claim verification occurs.
    """
    compute_recency_multiplier(None, reference_date)  # Validate even an empty batch.
    with localcontext(Context(prec=400)):
        total = sum(
            (
                Decimal(str(record.base_weight))
                * Decimal(str(compute_recency_multiplier(record.observation_date, reference_date)))
                for record in records
            ),
            Decimal(0),
        )
        raw_score = float(total)
        if not math.isfinite(raw_score):
            raise ValueError("Evidence total exceeds the finite float range")
        return raw_score, evidence_label_for_score(total)
