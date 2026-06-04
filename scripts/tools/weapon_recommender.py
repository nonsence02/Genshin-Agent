"""Inventory-aware weapon recommender for Genshin-Agent."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.tools.calculator import PROJECT_ROOT, normalize_id
from scripts.tools.weapon_info import get_weapon_record, load_weapons_db
from scripts.utils.name_resolver import normalize_weapon_name, resolve_weapon_key


DEFAULT_CHARACTER_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"
DEFAULT_BUILDS_PATH = PROJECT_ROOT / "data" / "character_builds.json"
DEFAULT_INVENTORY_PATH = PROJECT_ROOT / "data" / "inventory.json"


def recommend_best_weapon(character_id: str, inventory_file: str | Path = "data/inventory.json") -> str:
    """Recommend free weapons from inventory using manual character build preferences."""

    normalized_character_id = normalize_id(character_id)
    character = load_character_lore(normalized_character_id)
    if not character:
        return f"Персонаж '{character_id}' не найден в knowledge_base/character_lore."

    builds = load_json_object(DEFAULT_BUILDS_PATH)
    build = builds.get(normalized_character_id) if isinstance(builds, dict) else None
    if not isinstance(build, dict):
        return f"Для персонажа '{normalized_character_id}' билд не настроен в data/character_builds.json."

    signatures = normalize_id_set(build.get("signatures", []))
    preferred_stats = normalize_text_set(build.get("stats", []))
    passive_keywords = [normalize_text(keyword) for keyword in as_string_list(build.get("passive_keywords", []))]
    if not signatures and not preferred_stats and not passive_keywords:
        return f"Для персонажа '{normalized_character_id}' билд пока пуст: заполните signatures, stats или passive_keywords."

    inventory_path = resolve_project_path(inventory_file)
    if not inventory_path.exists():
        return f"Файл инвентаря '{inventory_path}' не найден."

    inventory = load_json_object(inventory_path)
    inventory_weapons = inventory.get("weapons", []) if isinstance(inventory, dict) else []
    if not isinstance(inventory_weapons, list):
        return f"Файл инвентаря '{inventory_path}' не содержит список weapons."

    weapons_db = load_weapons_db()
    if not weapons_db:
        return "База оружия не найдена или пуста."

    character_weapon_type = normalize_text(character.get("weapon", ""))
    character_names = {
        normalize_text(normalized_character_id),
        normalize_text(character.get("name_en", "")),
        normalize_text(character.get("name", "")),
    }

    candidates: list[dict[str, Any]] = []
    for inventory_weapon in inventory_weapons:
        if not isinstance(inventory_weapon, dict):
            continue
        if not is_weapon_available_for_character(inventory_weapon, character_names):
            continue

        inventory_key = str(inventory_weapon.get("key") or "").strip()
        weapon_id = resolve_weapon_key(inventory_key, weapons_db)
        if not weapon_id:
            continue

        weapon = get_weapon_record(weapon_id, weapons_db)
        if not weapon:
            continue

        profile = weapon.get("profile", {}) if isinstance(weapon.get("profile"), dict) else {}
        weapon_type = normalize_text(profile.get("type", ""))
        if character_weapon_type and weapon_type != character_weapon_type:
            continue

        score, reasons = score_weapon(weapon_id, weapon, signatures, preferred_stats, passive_keywords)
        if not reasons:
            continue

        candidates.append(
            {
                "score": score,
                "weapon_id": weapon_id,
                "weapon": weapon,
                "inventory_weapon": inventory_weapon,
                "reasons": reasons,
            }
        )

    if not candidates:
        return (
            f"Для {character.get('name_en', normalized_character_id)} не найдено свободного оружия, "
            "которое совпадает с настройками signatures/stats/passive_keywords."
        )

    candidates.sort(
        key=lambda item: (
            item["score"],
            int(item["inventory_weapon"].get("level") or 0),
            int(item["inventory_weapon"].get("refinement") or 1),
        ),
        reverse=True,
    )
    return format_recommendations(character, candidates)


def load_character_lore(character_id: str) -> dict[str, Any] | None:
    path = DEFAULT_CHARACTER_LORE_DIR / f"{normalize_id(character_id)}.json"
    if not path.exists():
        return None
    data = load_json_object(path)
    return data if isinstance(data, dict) else None


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def resolve_project_path(path: str | Path) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


def is_weapon_available_for_character(inventory_weapon: dict[str, Any], character_names: set[str]) -> bool:
    location = normalize_text(inventory_weapon.get("location", ""))
    return not location or location in character_names


def score_weapon(
    weapon_id: str,
    weapon: dict[str, Any],
    signatures: set[str],
    preferred_stats: set[str],
    passive_keywords: list[str],
) -> tuple[int, list[str]]:
    profile = weapon.get("profile", {}) if isinstance(weapon.get("profile"), dict) else {}
    secondary_stat = normalize_text(profile.get("secondary_stat", ""))
    passive = normalize_text(weapon.get("passive", ""))

    score = 0
    reasons: list[str] = []

    weapon_signature_keys = {
        normalize_id(weapon_id),
        normalize_weapon_name(weapon_id),
        normalize_weapon_name(weapon.get("name", "")),
    }
    if signatures.intersection(weapon_signature_keys):
        score += 300
        reasons.append("сигнатурное оружие из ручного билда")

    if secondary_stat and secondary_stat in preferred_stats:
        score += 200
        reasons.append(f"совпадает нужный сабстат: {profile.get('secondary_stat')}")

    matched_keywords = [
        keyword for keyword in passive_keywords if keyword and keyword in passive
    ]
    if matched_keywords:
        score += 100 + 10 * len(matched_keywords)
        reasons.append("пассивка содержит ключевые синергии: " + ", ".join(matched_keywords))

    return score, reasons


def format_recommendations(character: dict[str, Any], candidates: list[dict[str, Any]]) -> str:
    lines = [
        f"Рекомендации оружия для {character.get('name_en') or character.get('id')}:",
        f"Тип оружия персонажа: {character.get('weapon', 'Не найдено')}",
        "",
    ]

    for index, candidate in enumerate(candidates[:8], start=1):
        weapon = candidate["weapon"]
        inventory_weapon = candidate["inventory_weapon"]
        profile = weapon.get("profile", {}) if isinstance(weapon.get("profile"), dict) else {}
        stats = profile.get("stats", {}) if isinstance(profile.get("stats"), dict) else {}
        level_90 = stats.get("level_90", {}) if isinstance(stats.get("level_90"), dict) else {}

        level = inventory_weapon.get("level", "?")
        refinement = inventory_weapon.get("refinement", "?")
        secondary_stat = profile.get("secondary_stat", "Secondary Stat")
        secondary_value = level_90.get("secondary_stat_value", "не найдено")
        base_atk = level_90.get("base_atk", "не найдено")

        lines.extend(
            [
                f"{index}. {weapon.get('name', candidate['weapon_id'])} (ур. {level}, R{refinement})",
                f"   Причина: {'; '.join(candidate['reasons'])}.",
                f"   Статы на 90: Base ATK {base_atk}, {secondary_stat} {secondary_value}.",
            ]
        )

    return "\n".join(lines)


def as_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def normalize_id_set(value: Any) -> set[str]:
    signatures: set[str] = set()
    for item in as_string_list(value):
        signatures.add(normalize_id(item))
        signatures.add(normalize_weapon_name(item))
    return signatures


def normalize_text_set(value: Any) -> set[str]:
    return {normalize_text(item) for item in as_string_list(value)}


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").casefold()).strip()
