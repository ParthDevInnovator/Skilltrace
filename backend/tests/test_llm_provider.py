"""Unit tests for LLM providers (Gemini, Groq) and the fallback router using MockTransport."""
import httpx
import pytest

from backend.services.llm.provider import LLMProviderError, ImproperlyConfigured, ProviderName
from backend.services.llm.gemini import GeminiProvider
from backend.services.llm.groq import GroqProvider
from backend.services.llm.router import ProviderRouter, generate_with_fallback, get_provider_router


# --- 1. Gemini Provider Tests ---

@pytest.mark.asyncio
async def test_gemini_success_parsing():
    def handler(request: httpx.Request):
        assert request.headers.get("x-goog-api-key") == "fake-gemini-key"
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "Candidate has verified "}, {"text": "Python experience."}]
                    },
                    "finishReason": "STOP"
                }
            ]
        }
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)
    provider = GeminiProvider(api_key="fake-gemini-key", transport=transport)
    text = await provider.generate("Evaluate Alex", "You are an assistant", 0.0, 1000)
    assert text == "Candidate has verified Python experience."


@pytest.mark.asyncio
async def test_gemini_missing_api_key_raises_improperly_configured():
    with pytest.raises(ImproperlyConfigured) as exc_info:
        GeminiProvider(api_key="")
    assert exc_info.value.status_code == 503
    assert "Gemini API key not configured" in str(exc_info.value)


@pytest.mark.asyncio
async def test_gemini_429_rate_limit_retry_after():
    def handler(request: httpx.Request):
        return httpx.Response(429, headers={"retry-after": "45"}, json={"error": "Rate limit exceeded"})

    transport = httpx.MockTransport(handler)
    provider = GeminiProvider(api_key="fake-gemini-key", transport=transport)
    with pytest.raises(LLMProviderError) as exc_info:
        await provider.generate("Prompt", "System", 0.0, 1000)
    assert exc_info.value.provider == "gemini"
    assert exc_info.value.status_code == 429
    assert exc_info.value.retry_after == "45"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_body", [
    {"candidates": []},
    {"candidates": [{"content": {"parts": []}, "finishReason": "STOP"}]},
    {"candidates": [{"content": {"parts": [{"text": "   "}]}, "finishReason": "STOP"}]},
    {"candidates": [{"content": {"parts": [{"text": "Valid text"}]}, "finishReason": "SAFETY"}]},
    {"error": "Invalid JSON structure"},
])
async def test_gemini_malformed_or_incomplete_response(bad_body):
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=bad_body))
    provider = GeminiProvider(api_key="fake-gemini-key", transport=transport)
    with pytest.raises(LLMProviderError) as exc_info:
        await provider.generate("Prompt", "System", 0.0, 1000)
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_gemini_timeout_handling():
    def timeout_handler(request: httpx.Request):
        raise httpx.ReadTimeout("Connection timed out")

    transport = httpx.MockTransport(timeout_handler)
    provider = GeminiProvider(api_key="fake-gemini-key", transport=transport)
    with pytest.raises(LLMProviderError) as exc_info:
        await provider.generate("Prompt", "System", 0.0, 1000)
    assert exc_info.value.status_code == 504


# --- 2. Groq Provider Tests ---

@pytest.mark.asyncio
async def test_groq_success_parsing():
    def handler(request: httpx.Request):
        assert request.headers.get("Authorization") == "Bearer fake-groq-key"
        payload = {
            "choices": [
                {
                    "message": {"content": "Candidate has strong Go skills."},
                    "finish_reason": "stop"
                }
            ]
        }
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)
    provider = GroqProvider(api_key="fake-groq-key", transport=transport)
    text = await provider.generate("Evaluate Alex", "You are an assistant", 0.0, 1000)
    assert text == "Candidate has strong Go skills."


@pytest.mark.asyncio
async def test_groq_missing_api_key_raises_without_network():
    # If network were called, this handler would fail the test
    called = False
    def handler(request: httpx.Request):
        nonlocal called
        called = True
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handler)
    provider = GroqProvider(api_key="", transport=transport)
    with pytest.raises(LLMProviderError) as exc_info:
        await provider.generate("Prompt", "System", 0.0, 1000)
    assert not called
    assert exc_info.value.status_code == 503
    assert "Groq API key not configured" in str(exc_info.value)


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_body", [
    {"choices": []},
    {"choices": [{"message": {"content": "   "}, "finish_reason": "stop"}]},
    {"choices": [{"message": {"content": "Truncated"}, "finish_reason": "length"}]},
    {"choices": [{"message": {}, "finish_reason": "stop"}]},
])
async def test_groq_malformed_or_incomplete_response(bad_body):
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json=bad_body))
    provider = GroqProvider(api_key="fake-groq-key", transport=transport)
    with pytest.raises(LLMProviderError) as exc_info:
        await provider.generate("Prompt", "System", 0.0, 1000)
    assert exc_info.value.status_code == 502


# --- 3. Provider Router & Fallback Tests ---

@pytest.mark.asyncio
async def test_router_fallback_gemini_500_to_groq_success():
    def gemini_handler(request: httpx.Request):
        return httpx.Response(500, json={"error": "Internal Google error"})

    def groq_handler(request: httpx.Request):
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "Recovered via Groq"}, "finish_reason": "stop"}]
        })

    router = ProviderRouter.__new__(ProviderRouter)
    router.gemini = GeminiProvider(api_key="gem-key", transport=httpx.MockTransport(gemini_handler))
    router.groq = GroqProvider(api_key="groq-key", transport=httpx.MockTransport(groq_handler))
    router.configuration_error = None

    text, provider_name = await router.generate("Prompt", "System")
    assert text == "Recovered via Groq"
    assert provider_name == ProviderName.GROQ


@pytest.mark.asyncio
async def test_router_both_fail_raises_503_with_provider_errors():
    def gemini_handler(request: httpx.Request):
        return httpx.Response(500, json={"error": "Gemini error"})

    def groq_handler(request: httpx.Request):
        return httpx.Response(503, json={"error": "Groq overloaded"})

    router = ProviderRouter.__new__(ProviderRouter)
    router.gemini = GeminiProvider(api_key="gem-key", transport=httpx.MockTransport(gemini_handler))
    router.groq = GroqProvider(api_key="groq-key", transport=httpx.MockTransport(groq_handler))
    router.configuration_error = None

    with pytest.raises(LLMProviderError) as exc_info:
        await router.generate("Prompt", "System")
    assert exc_info.value.status_code == 503
    assert len(exc_info.value.provider_errors) == 2
    assert exc_info.value.provider_errors[0]["provider"] == "gemini"
    assert exc_info.value.provider_errors[1]["provider"] == "groq"


@pytest.mark.asyncio
async def test_router_gemini_unconfigured_falls_back_to_groq():
    def groq_handler(request: httpx.Request):
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "Groq only output"}, "finish_reason": "stop"}]
        })

    router = ProviderRouter.__new__(ProviderRouter)
    router.gemini = None
    router.configuration_error = ImproperlyConfigured("gemini", 503, "Gemini not set")
    router.groq = GroqProvider(api_key="groq-key", transport=httpx.MockTransport(groq_handler))

    text, provider_name = await router.generate("Prompt", "System")
    assert text == "Groq only output"
    assert provider_name == ProviderName.GROQ


@pytest.mark.asyncio
async def test_generate_with_fallback_helper(monkeypatch):
    class MockRouter:
        async def generate(self, prompt, system, temperature=0.0, max_tokens=2000):
            return "Mocked output", ProviderName.GEMINI

    monkeypatch.setattr("backend.services.llm.router.get_provider_router", lambda: MockRouter())
    text, name = await generate_with_fallback("Hello", "System")
    assert text == "Mocked output"
    assert name == ProviderName.GEMINI

