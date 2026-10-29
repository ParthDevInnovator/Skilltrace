import json
from pydantic import ValidationError
from backend.services.llm.router import generate_with_fallback
from .models import ChatMessage, AgentResponse
from .prompts import SYSTEM_AGENT
from .tools import TOOLS, TOOL_DEFINITIONS
from .grounding import json_data, parse_json, source_ids, citations, grounded_text

CAP_MESSAGE = "I've reached the maximum number of steps. Please rephrase your question or ask about a specific candidate."


async def run_agent_turn(history: list[ChatMessage], user_message: str, job_id: str | None) -> AgentResponse:
    messages = [m.model_dump() for m in history[-20:]] + [{'role': 'user', 'content': user_message}]
    resolved, allowed = set(), set()
    count = 0
    for _ in range(5):
        prompt = json.dumps({'history': messages, 'active_job_id': job_id, 'tools': TOOL_DEFINITIONS})
        text, provider = await generate_with_fallback(prompt, SYSTEM_AGENT)
        try:
            parsed = parse_json(text)
            call = parsed.get('tool_call') if isinstance(parsed, dict) else None
        except (ValueError, TypeError):
            call = None
        if call is None:
            if allowed:
                text = grounded_text(text, allowed)
            elif text.strip().endswith('?') or text.strip().lower() in ('hello', 'hello!', 'hi', 'hi!'):
                pass
            else:
                text = "Please provide a candidate name or email so I can resolve their identity and check the evidence."
            return AgentResponse(assistant_message=text, tool_calls_made=count,
                                 provider_used=provider, grounding_ids=citations(text, allowed))
        count += 1
        name = call.get('name') if isinstance(call, dict) else None
        result = {'error': 'Unknown or invalid tool call'}
        if name in TOOLS:
            schema, handler = TOOLS[name]
            try:
                args = schema.model_validate(call.get('arguments', {})).model_dump()
                candidate_id = args.get('candidate_id')
                if candidate_id and candidate_id not in resolved:
                    result = {'error': 'Resolve a unique candidate with lookup_candidate in this turn first'}
                else:
                    result = await handler(**args)
                    if name == 'lookup_candidate':
                        resolved = {result[0].id} if isinstance(result, list) and len(result) == 1 else set()
                        allowed.clear()
                    elif candidate_id:
                        allowed.update(source_ids(result) - resolved)
            except (ValidationError, TypeError, ValueError):
                result = {'error': 'Invalid tool arguments'}
        messages.extend([{'role': 'assistant', 'content': text},
                         {'role': 'tool', 'tool_call_id': str(count), 'content': json.dumps(json_data(result))}])
    return AgentResponse(assistant_message=CAP_MESSAGE, tool_calls_made=count, provider_used=provider, grounding_ids=[])
