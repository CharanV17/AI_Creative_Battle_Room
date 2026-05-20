from __future__ import annotations

import logging

import google.generativeai as genai

from app.config import settings
from app.providers.base import GenerationProvider

logger = logging.getLogger(__name__)


class GeminiGenerationProvider(GenerationProvider):
    """Uses Google Gemini 1.5 Flash for creative text generation."""

    def __init__(self) -> None:
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(settings.gemini_model)

    def generate(self, prompt: str, timeout_seconds: int) -> str:
        try:
            response = self._model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=1024,
                    temperature=1.0,
                ),
                request_options={"timeout": timeout_seconds},
            )
            return response.text
        except Exception as exc:
            logger.error("Gemini generation failed: %s", exc)
            raise RuntimeError(f"Gemini generation failed: {exc}") from exc

    def score(self, challenge_prompt: str, submission_content: str) -> int:
        """Score a submission 0-100 using Gemini. Returns 0 on failure."""
        scoring_prompt = (
            f'You are a creative director judging a competition.\n'
            f'Challenge: "{challenge_prompt}"\n'
            f'Submission: "{submission_content}"\n'
            f'Score this submission from 0 to 100 based on:\n'
            f'- Creativity and originality (40%)\n'
            f'- Relevance to the challenge (30%)\n'
            f'- Impact and persuasiveness (30%)\n'
            f'Reply with ONLY a single integer between 0 and 100. No explanation, no punctuation.'
        )
        try:
            response = self._model.generate_content(
                scoring_prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=8,
                    temperature=0.0,
                ),
                request_options={"timeout": 15},
            )
            text = response.text.strip()
            score = int("".join(filter(str.isdigit, text))[:3])
            return max(0, min(100, score))
        except Exception as exc:
            logger.warning("Gemini scoring failed, using fallback: %s", exc)
            # Fallback: word-count based
            return min(100, len(submission_content.split()) * 5)
