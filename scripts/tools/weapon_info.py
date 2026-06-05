"""Weapon lookup tool for the modular Genshin-Agent knowledge base."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.calculator import PROJECT_ROOT
from scripts.utils.name_resolver import resolve_weapon_key


DEFAULT_WEAPONS_DIR = PROJECT_ROOT / "knowledge_base" / "weapons"
LEGACY_WEAPONS_FILE = PROJECT_ROOT / "knowledge_base" / "weapons.json"


def get_weapon_details(weapon_name: str) -> str:
    """Return weapon details as a compact human-readable text block."""

    weapons_db = load_weapons_db()
    weapon_id = resolve_weapon_key(weapon_name, weapons_db)
    if not weapon_id:
        return f"Оружие '{weapon_name}' не найдено в базе."

    weapon = get_weapon_record(weapon_id, weapons_db)
    if not weapon:
        return f"Оружие '{weapon_name}' не найдено в базе."

    stats = weapon.get("stats", {}) if isinstance(weapon.get("stats"), dict) else {}
    level_90 = stats.get("level_90", {}) if isinstance(stats.get("level_90"), dict) else {}
    secondary_stat = level_90.get("secondary_stat") or "Доп. стат"
    secondary_value = format_stat_value(level_90.get("secondary_stat_value"))

    return "\n".join(
        [
            f"Оружие: {weapon.get('name_ru') or weapon.get('name_en') or weapon_id}",
            f"ID: {weapon.get('id', weapon_id)}",
            f"Тип: {weapon.get('weapon_type', 'Не найдено')}",
            f"Редкость: {weapon.get('rarity', 'Не найдено')} звезд",
            (
                "Статы 90 ур.: "
                f"Base ATK {format_stat_value(level_90.get('base_atk'))}, "
                f"{secondary_stat} {secondary_value}"
            ),
            f"Пассивка R1: {weapon.get('passive_name_ru') or 'Не найдено'}",
            weapon.get("passive_description_ru") or "Описание пассивки не найдено.",
            "Материалы возвышения:",
            f"- Подземелья: {format_material_items(get_material_group(weapon, 'domain_materials'))}",
            f"- Элитные враги: {format_material_items(get_material_group(weapon, 'elite_drops'))}",
            f"- Обычные враги: {format_material_items(get_material_group(weapon, 'common_drops'))}",
        ]
    )


def load_weapons_db() -> dict[str, Any]:
    """Load weapons from the modular folder, with a legacy aggregate fallback."""

    weapons: dict[str, Any] = {}
    if DEFAULT_WEAPONS_DIR.exists():
        for path in DEFAULT_WEAPONS_DIR.glob("*.json"):
            data = load_json_object(path)
            if not data:
                continue
            weapon_id = str(data.get("id") or path.stem)
            weapons[weapon_id] = data
        if weapons:
            return weapons

    if LEGACY_WEAPONS_FILE.exists():
        data = json.loads(LEGACY_WEAPONS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
        if isinstance(data, list):
            return {str(item.get("id") or ""): item for item in data if isinstance(item, dict) and item.get("id")}
    return weapons


def get_weapon_record(weapon_id: str, weapons_db: dict[str, Any]) -> dict[str, Any] | None:
    source = weapons_db.get("weapons", weapons_db) if isinstance(weapons_db, dict) else {}
    if isinstance(source, dict):
        weapon = source.get(weapon_id)
        return weapon if isinstance(weapon, dict) else None
    return None


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def get_material_group(weapon: dict[str, Any], group_name: str) -> list[Any]:
    materials = weapon.get("ascension_materials", {})
    if not isinstance(materials, dict):
        return []
    value = materials.get(group_name, [])
    return value if isinstance(value, list) else []


def format_material_items(value: list[Any]) -> str:
    if not value:
        return "Не найдено"

    names: list[str] = []
    for item in value:
        if isinstance(item, dict):
            names.append(str(item.get("name_ru") or item.get("name_en") or item.get("id") or ""))
        else:
            names.append(str(item))
    return ", ".join(name for name in names if name) or "Не найдено"


def format_stat_value(value: Any) -> str:
    if isinstance(value, (int, float)):
        if 0 < abs(value) < 1:
            return f"{value * 100:.1f}%"
        if float(value).is_integer():
            return str(int(value))
        return f"{value:.1f}"
    return "Не найдено"
