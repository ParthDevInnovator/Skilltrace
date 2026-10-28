import httpx
from backend.config import settings
from .provider import LLMProviderError


async def post(provider, url, headers, payload, transport=None):
    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS, transport=transport) as client:
            response = await client.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            raise LLMProviderError(provider, response.status_code, 'Provider request failed',
                                   retry_after=response.headers.get('retry-after'))
        return response.json()
    except httpx.TimeoutException as exc:
        raise LLMProviderError(provider, 504, 'Provider timed out') from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise LLMProviderError(provider, 502, 'Invalid provider response') from exc


def secret(value):
    return value.get_secret_value() if value else ''
