import logging
from functools import lru_cache
from .gemini import GeminiProvider
from .groq import GroqProvider
from .provider import LLMProviderError, ProviderName

logger = logging.getLogger(__name__)


class ProviderRouter:
    def __init__(self):
        # Missing Gemini configuration disables AI primary, never core startup.
        try:
            self.gemini = GeminiProvider()
            self.configuration_error = None
        except LLMProviderError as exc:
            self.gemini = None
            self.configuration_error = exc
        self.groq = GroqProvider()

    async def generate(self, prompt, system, temperature=0.0, max_tokens=2000):
        errors = []
        for name, provider in [(ProviderName.GEMINI, self.gemini), (ProviderName.GROQ, self.groq)]:
            try:
                if provider is None:
                    raise self.configuration_error
                return await provider.generate(prompt, system, temperature, max_tokens), name
            except LLMProviderError as exc:
                logger.warning('LLM unavailable provider=%s status=%s', name.value, exc.status_code)
                errors.append(exc.as_dict())
        raise LLMProviderError('gemini+groq', 503, 'AI providers unavailable', provider_errors=errors)


@lru_cache(maxsize=1)
def get_provider_router():
    return ProviderRouter()


async def generate_with_fallback(prompt: str, system: str, temperature: float = 0.0, max_tokens: int = 2000):
    return await get_provider_router().generate(prompt, system, temperature, max_tokens)
