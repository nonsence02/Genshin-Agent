"""Deterministic weapon ascension calculator for Genshin-Agent."""

from __future__ import annotations

from typing import Any

from scripts.tools.weapon_info import get_material_group, get_weapon_record, load_weapons_db
from scripts.utils.name_resolver import resolve_weapon_key


STANDARD_ASCENSION_90_COSTS = {
    "domain_materials": {
        "green": 5,
        "blue": 14,
        "purple": 14,
        "gold": 6,
    },
    "elite_drops": {
        "low": 15,
        "mid": 18,
        "high": 27,
    },
    "common_drops": {
        "low": 10,
        "mid": 15,
        "high": 18,
    },
}

DOMAIN_TIER_LABELS = {
    "green": "зеленые",
    "blue": "синие",
    "purple": "фиолетовые",
    "gold": "золотые",
}
THREE_TIER_LABELS = {
    "low": "низкий тир",
    "mid": "средний тир",
    "high": "высокий тир",
}


def calculate_weapon_ascension(weapon_name: str) -> str:
    """Return a compact material report for ascending a weapon to level 90."""

    weapons_db = load_weapons_db()
    if not weapons_db:
        return "База оружия не найдена или пуста."

    weapon_id = resolve_weapon_key(weapon_name, weapons_db)
    if not weapon_id:
        return f"Оружие '{weapon_name}' не найдено в базе."

    weapon = get_weapon_record(weapon_id, weapons_db)
    if not weapon:
        return f"Оружие '{weapon_name}' не найдено в базе."

    ascension_costs = get_ascension_costs(weapon)

    lines = [
        f"Материалы возвышения оружия до 90 уровня: {weapon.get('name_ru') or weapon.get('name_en') or weapon_id}",
        f"ID: {weapon.get('id', weapon_id)}",
        "",
        "Материалы из подземелий:",
        *format_cost_group(
            get_material_group(weapon, "domain_materials"),
            ascension_costs.get("domain_materials", {}),
            ["green", "blue", "purple", "gold"],
            DOMAIN_TIER_LABELS,
        ),
        "",
        "Дроп с элитных врагов:",
        *format_cost_group(
            get_material_group(weapon, "elite_drops"),
            ascension_costs.get("elite_drops", {}),
            ["low", "mid", "high"],
            THREE_TIER_LABELS,
        ),
        "",
        "Дроп с обычных врагов:",
        *format_cost_group(
            get_material_group(weapon, "common_drops"),
            ascension_costs.get("common_drops", {}),
            ["low", "mid", "high"],
            THREE_TIER_LABELS,
        ),
    ]
    return "\n".join(lines)


def get_ascension_costs(weapon: dict[str, Any]) -> dict[str, dict[str, int]]:
    standard_costs = weapon.get("standard_costs", {})
    if isinstance(standard_costs, dict):
        ascension_90 = standard_costs.get("ascension_90", {})
        if isinstance(ascension_90, dict) and ascension_90:
            return ascension_90
    return STANDARD_ASCENSION_90_COSTS


def format_cost_group(
    material_names: Any,
    costs: Any,
    tier_order: list[str],
    tier_labels: dict[str, str],
) -> list[str]:
    names = material_names if isinstance(material_names, list) else []
    amounts = costs if isinstance(costs, dict) else {}
    if not names or not amounts:
        return ["- Не найдено"]

    lines: list[str] = []
    for index, tier in enumerate(tier_order):
        name = material_display_name(names[index]) if index < len(names) else "Не найдено"
        amount = amounts.get(tier, 0)
        label = tier_labels.get(tier, tier)
        lines.append(f"- {amount} шт. ({label}) — {name}")
    return lines


def material_display_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name_ru") or value.get("name_en") or value.get("id") or "Не найдено")
    return str(value or "Не найдено")
