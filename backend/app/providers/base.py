from abc import ABC, abstractmethod


class GenerationProvider(ABC):
    @abstractmethod
    def generate(self, prompt: str, timeout_seconds: int) -> str:
        raise NotImplementedError
