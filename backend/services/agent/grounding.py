"""Validate citations against records actually made available in this generation."""
import json
import re

ID_PATTERN = re.compile(r'\b(?:(?:CLM|CLAIM|EVI|EVIDENCE)-[A-Za-z0-9_-]+|[A-Za-z0-9_-]+-REQ-[A-Za-z0-9_-]+)\b')
NO_EVIDENCE = "I don't have evidence for this."


def json_data(value):
    if hasattr(value, 'model_dump'):
        return value.model_dump(mode='json')
    if isinstance(value, list):
        return [json_data(item) for item in value]
    return value


def parse_json(text):
    return json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip()))


def source_ids(value):
    value = json_data(value)
    if isinstance(value, list):
        return set().union(*(source_ids(item) for item in value)) if value else set()
    if isinstance(value, dict):
        own = {str(value[key]) for key in ('id', 'requirement_id') if value.get(key)}
        return own.union(*(source_ids(item) for item in value.values()))
    return set()


def citations(text, allowed):
    return sorted(id for id in allowed if re.search(r'(?<![\w-])' + re.escape(id) + r'(?![\w-])', text))


def grounded_text(text, allowed):
    # Fail closed on invented IDs, and omit uncited factual sentences. Citation
    # validity is mechanical; semantic support still depends on model adherence.
    if set(ID_PATTERN.findall(text)) - allowed:
        return NO_EVIDENCE
    pieces = re.split(r'(?<=[.!?])\s+|\n', text.strip())
    kept = [p for p in pieces if citations(p, allowed) or p.strip().lower().startswith("i don't have evidence")]
    return '\n'.join(kept) or NO_EVIDENCE
