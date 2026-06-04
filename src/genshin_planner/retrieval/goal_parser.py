"""Simple lexical goal parser for on-demand knowledge retrieval."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Mapping, Sequence


DEFAULT_KEYWORD_ALIASES: dict[str, str] = {
    "varka": "varka",
    "варка": "varka",
    "варку": "varka",
    "варке": "varka",
    "варки": "varka",
    "nahida": "nahida",
    "нахида": "nahida",
    "нахиду": "nahida",
    "нахиде": "nahida",
    "нахиды": "nahida",
    "favonius": "favonius",
    "фавоний": "favonius",
    "фавония": "favonius",
    "фавониус": "favonius",
    "фавониуса": "favonius",
}


class GoalParser:
    """Find known entity keys mentioned in free-form goal text.

    `keyword_aliases` maps every searchable word or phrase to a canonical key.
    Example: {"варка": "varka", "varka": "varka"}.
    """

    def __init__(self, keyword_aliases: Mapping[str, str] | None = None) -> None:
        aliases = keyword_aliases or DEFAULT_KEYWORD_ALIASES
        self.keyword_aliases = {
            alias.casefold(): canonical_key for alias, canonical_key in aliases.items()
        }

    def parse_file(self, goals_path: str | Path) -> list[str]:
        text = Path(goals_path).read_text(encoding="utf-8")
        return self.parse_text(text)

    def parse_text(self, text: str) -> list[str]:
        normalized_text = text.casefold()
        found: list[str] = []
        seen: set[str] = set()

        for alias, canonical_key in self.keyword_aliases.items():
            if canonical_key in seen:
                continue
            if _contains_keyword(normalized_text, alias):
                found.append(canonical_key)
                seen.add(canonical_key)

        return found


def load_keyword_aliases(path: str | Path) -> dict[str, str]:
    """Load aliases from a simple UTF-8 text file.

    File format:
        alias=canonical_key

    Blank lines and lines starting with # are ignored.
    """

    aliases: dict[str, str] = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            raise ValueError(f"Expected alias=canonical_key line, got: {line}")
        alias, canonical_key = stripped.split("=", 1)
        aliases[alias.strip()] = canonical_key.strip()
    return aliases


def merge_keyword_aliases(
    *alias_maps: Mapping[str, str] | Sequence[tuple[str, str]],
) -> dict[str, str]:
    """Merge alias maps while preserving a simple extension point."""

    merged: dict[str, str] = {}
    for alias_map in alias_maps:
        items = alias_map.items() if isinstance(alias_map, Mapping) else alias_map
        for alias, canonical_key in items:
            merged[str(alias)] = str(canonical_key)
    return merged


def _contains_keyword(text: str, keyword: str) -> bool:
    if not keyword:
        return False
    if _is_word_like(keyword):
        pattern = rf"(?<![\w]){re.escape(keyword)}(?![\w])"
        return re.search(pattern, text, flags=re.IGNORECASE) is not None
    return keyword in text


def _is_word_like(value: str) -> bool:
    return bool(re.fullmatch(r"[\w-]+", value, flags=re.IGNORECASE))
