"""Inspect currently equipped weapon and artifacts for a character."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.artifact_scorer import (
    extract_substats,
    normalize_location,
    normalize_slot,
    normalize_stat,
    resolve_inventory_path,
    stat_name,
    stat_value_as_percent,
)
from scripts.tools.calculator import resolve_character_id


def get_character_equipment(character_name: str, inventory_file: str | Path = "data/inventory.json") -> str:
    """Return currently equipped weapon, artifacts, and total artifact CV."""

    character_id = resolve_character_id(character_name) or str(character_name or "").strip()
    if not character_id:
        return "Не указано имя персонажа."

    inventory_path = resolve_inventory_path(inventory_file)
    if not inventory_path.exists():
        return f"Файл инвентаря '{inventory_path}' не найден."

    inventory = load_json_object(inventory_path)
    if not inventory:
        return f"Файл инвентаря '{inventory_path}' пуст или не является JSON-объектом."

    location_key = normalize_location(character_id)
    weapons = inventory.get("weapons", [])
    artifacts = inventory.get("artifacts", [])

    equipped_weapon = find_equipped_weapon(weapons, location_key)
    equipped_artifacts = find_equipped_artifacts(artifacts, location_key)

    if not equipped_weapon and not equipped_artifacts:
        return f"На персонаже {character_name} сейчас нет экипировки."

    lines = [f"Экипировка персонажа: {character_name} ({character_id})", ""]
    lines.extend(format_weapon_section(equipped_weapon))
    lines.append("")
    lines.extend(format_artifacts_section(equipped_artifacts))
    return "\n".join(lines)


def find_equipped_weapon(weapons: Any, location_key: str) -> dict[str, Any] | None:
    if not isinstance(weapons, list):
        return None
    for weapon in weapons:
        if not isinstance(weapon, dict):
            continue
        if normalize_location(weapon.get("location", "")) == location_key:
            return weapon
    return None


def find_equipped_artifacts(artifacts: Any, location_key: str) -> list[dict[str, Any]]:
    if not isinstance(artifacts, list):
        return []
    return [
        artifact
        for artifact in artifacts
        if isinstance(artifact, dict) and normalize_location(artifact.get("location", "")) == location_key
    ]


def format_weapon_section(weapon: dict[str, Any] | None) -> list[str]:
    lines = ["Оружие:"]
    if not weapon:
        lines.append("- Не надето")
        return lines

    lines.append(
        "- {key} (ур. {level}, R{refinement})".format(
            key=weapon.get("key") or "Не найдено",
            level=weapon.get("level", "?"),
            refinement=weapon.get("refinement", "?"),
        )
    )
    return lines


def format_artifacts_section(artifacts: list[dict[str, Any]]) -> list[str]:
    lines = ["Артефакты:"]
    if not artifacts:
        lines.append("- Не надеты")
        lines.append("Общий CV сборки: 0.0")
        return lines

    total_cv = 0.0
    artifacts_by_slot = sorted(
        artifacts,
        key=lambda artifact: slot_sort_key(normalize_slot(artifact.get("slotKey") or artifact.get("slot") or artifact.get("equipType"))),
    )
    for artifact in artifacts_by_slot:
        slot = normalize_slot(artifact.get("slotKey") or artifact.get("slot") or artifact.get("equipType"))
        set_name = artifact.get("setKey") or artifact.get("set") or artifact.get("setName") or "Не найдено"
        main_stat_key = artifact.get("mainStatKey") or artifact.get("mainStat") or artifact.get("main_stat")
        main_stat = display_stat_name(main_stat_key) or "Не найдено"
        level = artifact.get("level", "?")
        rarity = artifact.get("rarity", "?")
        substats = extract_substats(artifact)
        cv = calculate_artifact_cv(substats)
        total_cv += cv

        lines.extend(
            [
                f"- {slot}: {set_name} (+{level}, {rarity} звезд)",
                f"  Мейн-стат: {main_stat}",
                f"  CV: {cv:.1f}",
                f"  Сабстаты: {format_equipped_substats(substats)}",
            ]
        )

    lines.append(f"Общий CV сборки: {total_cv:.1f}")
    if len(artifacts) < 5:
        lines.append(f"Надето артефактов: {len(artifacts)}/5")
    return lines


def calculate_artifact_cv(substats: list[tuple[str, Any]]) -> float:
    crit_rate = 0.0
    crit_dmg = 0.0
    for name, value in substats:
        normalized = normalize_stat(name)
        if normalized == "crit_rate":
            crit_rate += stat_value_as_percent(value)
        elif normalized == "crit_dmg":
            crit_dmg += stat_value_as_percent(value)
    return crit_rate * 2 + crit_dmg


def format_equipped_substats(substats: list[tuple[str, Any]]) -> str:
    if not substats:
        return "Не найдены"
    return ", ".join(f"{display_stat_name(name)} {format_equipped_stat_value(name, value)}" for name, value in substats)


def format_equipped_stat_value(name: str, value: Any) -> str:
    normalized = normalize_stat(name)
    numeric = safe_float(value)
    if normalized in {"crit_rate", "crit_dmg", "energy_recharge"} or str(name).endswith("_"):
        return f"{stat_value_as_percent(value):.1f}%"
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.1f}"


def display_stat_name(value: Any) -> str:
    mapping = {
        "pyro_dmg_": "Pyro DMG Bonus",
        "hydro_dmg_": "Hydro DMG Bonus",
        "cryo_dmg_": "Cryo DMG Bonus",
        "electro_dmg_": "Electro DMG Bonus",
        "anemo_dmg_": "Anemo DMG Bonus",
        "geo_dmg_": "Geo DMG Bonus",
        "dendro_dmg_": "Dendro DMG Bonus",
        "physical_dmg_": "Physical DMG Bonus",
        "heal_": "Healing Bonus",
    }
    key = str(value or "")
    return mapping.get(key, stat_name(key))


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def slot_sort_key(slot: str) -> int:
    order = {"flower": 0, "plume": 1, "sands": 2, "goblet": 3, "circlet": 4}
    return order.get(slot, 99)


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}
