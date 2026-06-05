"""Character lookup tool for the modular Genshin-Agent knowledge base."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.calculator import DEFAULT_CHARACTER_KB_DIR, DEFAULT_DICTIONARY_PATH, PROJECT_ROOT, resolve_character_id


DEFAULT_CHARACTER_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
DEFAULT_MANUAL_ROLES_PATH = PROJECT_ROOT / "data" / "manual_roles.json"

ELEMENTS_RU = {
    "Anemo": "Анемо",
    "Geo": "Гео",
    "Electro": "Электро",
    "Dendro": "Дендро",
    "Hydro": "Гидро",
    "Pyro": "Пиро",
    "Cryo": "Крио",
    "None": "Без элемента",
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
    character_dir: Path = DEFAULT_CHARACTER_DIR,
    character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR,
    dictionary_path: Path = DEFAULT_DICTIONARY_PATH,
    manual_roles_path: Path = DEFAULT_MANUAL_ROLES_PATH,
) -> dict[str, Any]:
    """Return structured gameplay data for one or more characters."""

    results: dict[str, Any] = {}
    manual_roles = load_manual_roles(manual_roles_path)

    for raw_name in character_names:
        requested_name = str(raw_name).strip()
        if not requested_name:
            continue

        character_id = resolve_character_id(requested_name, character_kb_dir, dictionary_path)
        if not character_id:
            results[requested_name] = {
                "error": f"Персонаж '{requested_name}' не найден в базе. Попроси пользователя уточнить имя.",
                "requested_name": requested_name,
            }
            continue

        path = character_dir / f"{character_id}.json"
        if not path.exists():
            results[character_id] = {
                "error": f"Файл персонажа '{requested_name}' не найден в knowledge_base/characters.",
                "requested_name": requested_name,
                "resolved_character_id": character_id,
                "knowledge_path": str(path),
            }
            continue

        data = load_json_object(path)
        if not data:
            results[character_id] = {
                "error": "Файл персонажа поврежден или не является JSON-объектом.",
                "requested_name": requested_name,
                "resolved_character_id": character_id,
                "knowledge_path": str(path),
            }
            continue

        results[character_id] = extract_character_payload(data, requested_name, path, manual_roles)

    return results


def load_manual_roles(path: Path) -> dict[str, list[str]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

    if not isinstance(data, dict):
        return {}

    roles: dict[str, list[str]] = {}
    for key, value in data.items():
        if isinstance(value, list):
            roles[str(key)] = [str(item).strip() for item in value if str(item).strip()]
    return roles


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def extract_character_payload(
    data: dict[str, Any],
    requested_name: str,
    path: Path,
    manual_roles: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    character_id = str(data.get("id") or path.stem)
    roles = (manual_roles or {}).get(character_id, [])

    return {
        "requested_name": requested_name,
        "id": character_id,
        "name_ru": data.get("name_ru", ""),
        "name_en": data.get("name_en", ""),
        "element": translate_term(data.get("element", ""), ELEMENTS_RU),
        "weapon_type": translate_term(data.get("weapon_type", ""), WEAPONS_RU),
        "rarity": data.get("rarity"),
        "stats": data.get("stats", {}),
        "role": ", ".join(roles) if roles else "Не указана",
        "talents": data.get("talents", []),
        "passive_talents": data.get("passive_talents", []),
        "constellations": data.get("constellations", []),
        "coordinates": data.get("coordinates", []),
    }


def translate_term(value: Any, dictionary: dict[str, str]) -> str:
    text = str(value or "").strip()
    return dictionary.get(text, text)
