"""Small text-generation boundary shared by all AI features."""
from abc import ABC, abstractmethod
from enum import Enum


class ProviderName(str, Enum):
    GEMINI = 'gemini'
    GROQ = 'groq'
    OLLAMA = 'ollama'


class LLMProviderError(Exception):
    def __init__(self, provider, status_code, message, retry_after=None, provider_errors=None):
        super().__init__(message)
        self.provider = provider
        self.status_code = status_code
        self.message = message
        self.retry_after = retry_after
        self.provider_errors = provider_errors or []

    def as_dict(self):
        return dict(provider=self.provider, status_code=self.status_code,
                    message=self.message, retry_after=self.retry_after)


class ImproperlyConfigured(LLMProviderError):
    pass


class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, system: str, temperature: float, max_tokens: int) -> str:
        """Return complete text or raise LLMProviderError."""
