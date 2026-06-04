"""Weapon lookup tool for Genshin-Agent."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.calculator import PROJECT_ROOT
from scripts.utils.name_resolver import resolve_weapon_key


DEFAULT_WEAPONS_FILE = PROJECT_ROOT / "knowledge_base" / "weapons.json"
DEFAULT_WEAPONS_DIR = PROJECT_ROOT / "knowledge_base" / "weapons"


def get_weapon_details(weapon_name: str) -> str:
    """Return structured weapon details as a compact human-readable text block."""

    weapons_db = load_weapons_db()
    weapon_id = resolve_weapon_key(weapon_name, weapons_db)
    if not weapon_id:
        return f"Оружие '{weapon_name}' не найдено в базе."

    weapon = get_weapon_record(weapon_id, weapons_db)
    if not weapon:
        return f"Оружие '{weapon_name}' не найдено в базе."

    profile = weapon.get("profile", {}) if isinstance(weapon.get("profile"), dict) else {}
    stats = profile.get("stats", {}) if isinstance(profile.get("stats"), dict) else {}
    level_90 = stats.get("level_90", {}) if isinstance(stats.get("level_90"), dict) else {}
    materials = weapon.get("materials", {}) if isinstance(weapon.get("materials"), dict) else {}

    return "\n".join(
        [
            f"Оружие: {weapon.get('name', weapon_id)}",
            f"ID: {weapon.get('id', weapon_id)}",
            f"Тип: {profile.get('type', 'Не найдено')}",
            f"Редкость: {profile.get('rarity', 'Не найдено')}",
            (
                "Статы 90 ур.: "
                f"Base ATK {level_90.get('base_atk', 'Не найдено')}, "
                f"{profile.get('secondary_stat', 'Secondary Stat')} "
                f"{level_90.get('secondary_stat_value', 'Не найдено')}"
            ),
            f"Пассивка R1: {weapon.get('passive', 'Не найдено')}",
            "Материалы возвышения:",
            f"- Domain: {format_items(materials.get('domain_materials', []))}",
            f"- Elite: {format_items(materials.get('elite_drops', []))}",
            f"- Common: {format_items(materials.get('common_drops', []))}",
        ]
    )


def load_weapons_db() -> dict[str, Any]:
    if DEFAULT_WEAPONS_FILE.exists():
        data = json.loads(DEFAULT_WEAPONS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}

    weapons: dict[str, Any] = {}
    if not DEFAULT_WEAPONS_DIR.exists():
        return weapons

    for path in DEFAULT_WEAPONS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        weapon_id = str(data.get("id") or path.stem)
        weapons[weapon_id] = data
    return weapons


def get_weapon_record(weapon_id: str, weapons_db: dict[str, Any]) -> dict[str, Any] | None:
    source = weapons_db.get("weapons", weapons_db)
    if isinstance(source, dict):
        weapon = source.get(weapon_id)
        return weapon if isinstance(weapon, dict) else None
    if isinstance(source, list):
        for weapon in source:
            if isinstance(weapon, dict) and str(weapon.get("id") or "") == weapon_id:
                return weapon
    return None


def format_items(value: Any) -> str:
    if isinstance(value, list) and value:
        return ", ".join(str(item) for item in value)
    return "Не найдено"
