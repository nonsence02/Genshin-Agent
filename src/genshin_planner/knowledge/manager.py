"""Markdown knowledge base loader."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence


DEFAULT_COLLECTIONS: tuple[str, ...] = ("characters", "weapons", "materials")


@dataclass(frozen=True)
class KnowledgeBaseManager:
    """Load compact Markdown knowledge snippets by canonical entity key."""

    root_dir: Path | str = field(default_factory=lambda: _project_root() / "knowledge_base")
    collections: Sequence[str] = DEFAULT_COLLECTIONS

    def get_context(self, keys: Sequence[str]) -> str:
        unique_keys = _deduplicate(keys)
        if not unique_keys:
            return "Релевантные сущности в целях не найдены. База знаний не подгружалась."

        sections: list[str] = []
        missing: list[str] = []

        for key in unique_keys:
            file_path = self.find_entry(key)
            if file_path is None:
                missing.append(key)
                continue
            content = file_path.read_text(encoding="utf-8").strip()
            if content:
                sections.append(content)

        if missing:
            missing_text = ", ".join(missing)
            sections.append(f"## Нет записей в базе знаний\n- Ключи без файлов: {missing_text}")

        return "\n\n---\n\n".join(sections) if sections else "База знаний не содержит данных по найденным сущностям."

    def find_entry(self, key: str) -> Path | None:
        normalized_key = key.casefold().strip()
        if not normalized_key:
            return None

        root = Path(self.root_dir)
        for collection in self.collections:
            candidate = root / collection / f"{normalized_key}.md"
            if candidate.is_file():
                return candidate
        return None


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _deduplicate(values: Sequence[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.casefold().strip()
        if not normalized or normalized in seen:
            continue
        result.append(normalized)
        seen.add(normalized)
    return result
