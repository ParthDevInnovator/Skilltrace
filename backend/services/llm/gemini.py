from backend.config import settings
from .provider import LLMProvider, LLMProviderError, ImproperlyConfigured
from .http import post, secret


class GeminiProvider(LLMProvider):
    def __init__(self, *, api_key=None, model=None, transport=None):
        self.key = secret(settings.GEMINI_API_KEY) if api_key is None else api_key
        self.model = model or settings.gemini_model
        self.transport = transport
        if not self.key:
            raise ImproperlyConfigured('gemini', 503, 'Gemini API key not configured')

    async def generate(self, prompt, system, temperature, max_tokens):
        body = await post('gemini', f'https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent',
            {'x-goog-api-key': self.key}, {'systemInstruction': {'parts': [{'text': system}]},
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'temperature': temperature, 'maxOutputTokens': max_tokens}}, self.transport)
        try:
            candidate = body['candidates'][0]
            if candidate.get('finishReason', 'STOP') != 'STOP':
                raise ValueError('Incomplete response')
            text = ''.join(part['text'] for part in candidate['content']['parts'])
            if not text.strip():
                raise ValueError('Empty response')
            return text
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise LLMProviderError('gemini', 502, 'Incomplete or invalid provider response') from exc
