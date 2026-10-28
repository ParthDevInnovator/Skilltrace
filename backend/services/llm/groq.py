from backend.config import settings
from .provider import LLMProvider, LLMProviderError
from .http import post, secret


class GroqProvider(LLMProvider):
    def __init__(self, *, api_key=None, model=None, transport=None):
        self.key = secret(settings.GROQ_API_KEY) if api_key is None else api_key
        self.model = model or settings.groq_model
        self.transport = transport

    async def generate(self, prompt, system, temperature, max_tokens):
        if not self.key:
            raise LLMProviderError('groq', 503, 'Groq API key not configured')
        body = await post('groq', 'https://api.groq.com/openai/v1/chat/completions',
            {'Authorization': f'Bearer {self.key}'}, {'model': self.model,
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}],
            'temperature': temperature, 'max_tokens': max_tokens}, self.transport)
        try:
            choice = body['choices'][0]
            text = choice['message']['content']
            if choice.get('finish_reason', 'stop') != 'stop' or not isinstance(text, str) or not text.strip():
                raise ValueError('Incomplete response')
            return text
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMProviderError('groq', 502, 'Incomplete or invalid provider response') from exc
