"""Character lore lookup tool for Genshin-Agent.

This module is intentionally read-only: it resolves user-facing character names
to local KB ids and returns structured lore/kit metadata from JSON files.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.calculator import (
    DEFAULT_CHARACTER_KB_DIR,
    DEFAULT_DICTIONARY_PATH,
    PROJECT_ROOT,
    resolve_character_id,
)


DEFAULT_CHARACTER_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"

ELEMENTS_RU = {
    "Anemo": "Анемо",
    "Geo": "Гео",
    "Electro": "Электро",
    "Dendro": "Дендро",
    "Hydro": "Гидро",
    "Pyro": "Пиро",
    "Cryo": "Крио",
}

WEAPONS_RU = {
    "Sword": "Одноручный меч",
    "Claymore": "Двуручный меч",
    "Polearm": "Древковое",
    "Bow": "Стрелковое",
    "Catalyst": "Катализатор",
}


def get_character_lore(
    character_names: list[str],
    *,
    lore_dir: Path = DEFAULT_CHARACTER_LORE_DIR,
    character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR,
    dictionary_path: Path = DEFAULT_DICTIONARY_PATH,
) -> dict[str, Any]:
    """Return lore and combat metadata for one or more characters."""

    results: dict[str, Any] = {}
    for raw_name in character_names:
        character_name = str(raw_name).strip()
        if not character_name:
            continue

        character_id = resolve_character_id(character_name, character_kb_dir, dictionary_path)
        if not character_id:
            results[character_name] = {
                "error": f"Персонаж '{character_name}' не найден в базе. Попроси пользователя уточнить имя.",
                "requested_name": character_name,
            }
            continue

        path = lore_dir / f"{character_id}.json"
        if not path.exists():
            results[character_id] = {
                "error": f"Лор-файл для персонажа '{character_name}' не найден.",
                "requested_name": character_name,
                "resolved_character_id": character_id,
                "knowledge_path": str(path),
            }
            continue

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            results[character_id] = {
                "error": "Файл лора поврежден или не является валидным JSON.",
                "requested_name": character_name,
                "resolved_character_id": character_id,
                "knowledge_path": str(path),
                "message": str(exc),
            }
            continue

        if not isinstance(data, dict):
            results[character_id] = {
                "error": "Файл лора должен содержать JSON-объект.",
                "requested_name": character_name,
                "resolved_character_id": character_id,
                "knowledge_path": str(path),
            }
            continue

        results[character_id] = extract_lore_payload(data, character_name, path)

    return results


def extract_lore_payload(data: dict[str, Any], requested_name: str, path: Path) -> dict[str, Any]:
    ai_tags = str(data.get("ai_tags", "") or "").strip()
    return {
        "requested_name": requested_name,
        "id": data.get("id", path.stem),
        "name_en": data.get("name_en", ""),
        "element": translate_term(data.get("element", ""), ELEMENTS_RU),
        "weapon": translate_term(data.get("weapon", ""), WEAPONS_RU),
        "region": data.get("region", ""),
        "rarity": data.get("rarity"),
        "description": data.get("description", ""),
        "ai_tags": ai_tags,
        "role_summary": ai_tags or data.get("role_summary", ""),
        "combat_talents": data.get("combat_talents", {}),
        "constellations": data.get("constellations", {}),
        "source_url": data.get("source_url", ""),
    }


def translate_term(value: Any, dictionary: dict[str, str]) -> str:
    text = str(value or "").strip()
    return dictionary.get(text, text)
