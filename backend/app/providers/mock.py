import random
import time

from app.config import settings
from app.providers.base import GenerationProvider

_MOCK_OUTPUTS = [
    "⚡ NEON BLOOM — A cyberpunk perfume that smells like rain on hot circuitry, blooming cherry blossoms, and the faint hum of a neon sign at 3AM. For the Gen-Z who lives between the digital and the divine.",
    "🌆 CHROME NOIR — Dark bergamot meets chrome metal accord and synthetic musk. A scent that says 'I code in the dark and I still look incredible.'",
    "💜 VOID CRYSTAL — Amethyst-infused air, electric violet top notes, crystalline white musk base. This is what the future smells like when luxury has no limits.",
    "🔥 CIRCUIT BLOSSOM — Rose gold petals burned at the edges, smoky oud, and a crackling ozone heart. The perfume for those who refuse to exist quietly.",
    "🌌 SINGULARITY — A black hole of scent: infinite depth, dark patchouli cosmos, a whisper of AI-generated jasmine. You smell like the end of the simulation.",
]


class MockGenerationProvider(GenerationProvider):
    """Mock provider that returns realistic creative outputs with configurable delay."""

    def generate(self, prompt: str, timeout_seconds: int) -> str:
        delay = settings.mock_provider_delay_seconds
        if "fail" in prompt.lower():
            raise RuntimeError("Mock provider: forced failure triggered")
        if delay > timeout_seconds:
            time.sleep(timeout_seconds)
            raise TimeoutError(f"Mock provider timed out after {timeout_seconds}s")
        time.sleep(delay)
        return random.choice(_MOCK_OUTPUTS)

    def score(self, challenge_prompt: str, submission_content: str) -> int:
        """Mock scoring: word-count based, capped at 100."""
        return min(100, len(submission_content.split()) * 5 + random.randint(0, 20))
