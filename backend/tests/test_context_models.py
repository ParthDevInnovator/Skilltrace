import pytest
from pydantic import ValidationError

from backend.models import ResumeClaim, ClaimSection, ClaimVerificationState


@pytest.fixture
def claim_data():
    return {
        "candidate_id": "CAND-001",
        "claim_text": "Built reliable Python services",
        "extraction_trigger": "Built",
        "section": "Experience",
        "skill": "Python",
        "provenance": "Rule-based bullet extraction: action verb and skill keyword",
    }


def test_claim_defaults_to_unverified_and_serializes(claim_data):
    claim = ResumeClaim(**claim_data)
    assert claim.verification_state is ClaimVerificationState.UNVERIFIED
    assert claim.section is ClaimSection.EXPERIENCE
    assert claim.model_dump(mode="json")["verification_state"] == "unverified"
    assert ResumeClaim.model_validate_json(claim.model_dump_json()) == claim


def test_claim_identity_survives_reextraction(claim_data):
    original = ResumeClaim(**claim_data)
    repeated = ResumeClaim(**{
        **claim_data,
        "claim_text": "  BUILT   reliable Python services  ",
        "skill": None,
        "provenance": "Updated extraction rule",
    })
    assert original.id == repeated.id
    assert original.claim_text == claim_data["claim_text"]
    assert original.id != ResumeClaim(**{**claim_data, "candidate_id": "CAND-002"}).id
    assert original.id != ResumeClaim(**{**claim_data, "claim_text": "Led Python migration"}).id
    assert original.id != ResumeClaim(**{**claim_data, "section": "Projects"}).id


def test_claim_accepts_persisted_id(claim_data):
    assert ResumeClaim(id="CLAIM-existing", **claim_data).id == "CLAIM-existing"


def test_unidentified_skill_and_section_are_explicit(claim_data):
    claim_data.pop("skill")
    claim = ResumeClaim(**{**claim_data, "section": "Unknown"})
    assert claim.skill is None
    assert claim.section is ClaimSection.UNKNOWN


@pytest.mark.parametrize("state", ["supported", "contradicted"])
def test_claim_assessment_must_be_explicit(claim_data, state):
    claim = ResumeClaim(**claim_data, verification_state=state)
    assert claim.model_dump(mode="json")["verification_state"] == state
    with pytest.raises(ValidationError):
        claim.verification_state = "verified"


@pytest.mark.parametrize("field", ["candidate_id", "claim_text", "extraction_trigger", "provenance", "skill", "id"])
def test_claim_rejects_blank_metadata(claim_data, field):
    with pytest.raises(ValidationError):
        ResumeClaim(**{**claim_data, field: "   "})


@pytest.mark.parametrize("field,value", [
    ("verification_state", "verified"),
    ("section", "unsupported-section"),
    ("evidence", [{"source": "github"}]),
])
def test_claim_rejects_unsupported_states_and_implicit_evidence(claim_data, field, value):
    with pytest.raises(ValidationError):
        ResumeClaim(**{**claim_data, field: value})
