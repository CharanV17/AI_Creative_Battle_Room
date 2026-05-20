from app.config import settings
from app.providers.base import GenerationProvider
from app.providers.mock import MockGenerationProvider


def get_generation_provider() -> GenerationProvider:
    """Return the configured AI generation provider."""
    if settings.job_provider == "gemini" and settings.gemini_api_key:
        from app.providers.gemini import GeminiGenerationProvider  # noqa: PLC0415
        return GeminiGenerationProvider()
    return MockGenerationProvider()
