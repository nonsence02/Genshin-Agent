"""Build the final prompt context for the local planner LLM."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from genshin_planner.knowledge import KnowledgeBaseManager


@dataclass(frozen=True)
class ContextBuilder:
    """Assemble inventory, goals, and retrieved Markdown knowledge into one prompt."""

    knowledge_manager: KnowledgeBaseManager = field(default_factory=KnowledgeBaseManager)

    def build_prompt(
        self,
        inventory_markdown: str,
        goals_text: str,
        entity_keys: Sequence[str],
    ) -> str:
        knowledge_context = self.knowledge_manager.get_context(entity_keys)

        return "\n".join(
            [
                "Ты — локальный планировщик Genshin Impact.",
                "Составь практичный пошаговый план фарма с учетом инвентаря, целей игрока, дней недели и смолы.",
                "Используй только переданный инвентарь, цели и подгруженную базу знаний.",
                "Не выдумывай отсутствующие данные: если информации не хватает, явно отметь это в плане.",
                "",
                "## Инвентарь игрока",
                inventory_markdown.strip() or "Нет данных об инвентаре.",
                "",
                "## Цели игрока",
                goals_text.strip() or "Цели не указаны.",
                "",
                "## Подгруженная база знаний",
                knowledge_context.strip() or "База знаний не подгружалась.",
                "",
                "## Формат ответа",
                "- Краткая сводка цели.",
                "- Что уже есть у игрока.",
                "- Чего не хватает.",
                "- План фарма по шагам.",
                "- Приоритеты на ближайшие 3-7 дней.",
            ]
        )

    def build_prompt_from_files(
        self,
        inventory_path: str | Path,
        goals_path: str | Path,
        entity_keys: Sequence[str],
    ) -> str:
        inventory_markdown = Path(inventory_path).read_text(encoding="utf-8")
        goals_text = Path(goals_path).read_text(encoding="utf-8")
        return self.build_prompt(inventory_markdown, goals_text, entity_keys)
