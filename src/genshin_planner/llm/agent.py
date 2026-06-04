"""Planner agent that asks a local LLM to produce the final farming plan."""

from __future__ import annotations

from dataclasses import dataclass, field

from .ollama_client import OllamaClient


SYSTEM_PROMPT = """Ты — прагматичный ИИ-помощник по Genshin Impact.
Твоя задача — составить план фарма и прокачки на основе переданного инвентаря, целей игрока и базы знаний.
Выдавай ответ в формате Markdown.
Будь краток и конкретен.
Не выдумывай механики, материалы, дни фарма или требования.
Опирайся только на переданную базу знаний и инвентарь.
Если данных не хватает, явно напиши, каких данных не хватает и что нужно добавить в базу знаний."""


@dataclass
class PlannerAgent:
    """Generate a Markdown plan from a fully assembled prompt."""

    client: OllamaClient = field(default_factory=OllamaClient)
    system_prompt: str = SYSTEM_PROMPT

    def generate_plan(self, context_prompt: str) -> str:
        return self.client.chat(
            [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": context_prompt},
            ]
        )
