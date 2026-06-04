"""Thin Ollama chat client wrapper."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


DEFAULT_MODEL = "qwen2.5:7b-instruct-q4_K_M"


@dataclass
class OllamaClient:
    """Small wrapper around `ollama.chat` with sensible local defaults."""

    model: str = DEFAULT_MODEL
    num_ctx: int = 8192
    temperature: float = 0.2
    top_p: float = 0.9
    extra_options: Mapping[str, Any] = field(default_factory=dict)

    def chat(self, messages: Sequence[Mapping[str, str]]) -> str:
        try:
            import ollama
        except ImportError as exc:
            raise RuntimeError(
                "Python package `ollama` is not installed. Install it with `pip install ollama`."
            ) from exc

        response = ollama.chat(
            model=self.model,
            messages=list(messages),
            options=self._options(),
        )
        return str(response["message"]["content"])

    def _options(self) -> dict[str, Any]:
        options: dict[str, Any] = {
            "num_ctx": self.num_ctx,
            "temperature": self.temperature,
            "top_p": self.top_p,
        }
        options.update(self.extra_options)
        return options
