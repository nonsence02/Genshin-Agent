"""Inventory-aware artifact recommender with CV and useful-roll scoring."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.tools.calculator import PROJECT_ROOT, normalize_id, resolve_character_id


DEFAULT_BUILDS_PATH = PROJECT_ROOT / "data" / "character_builds.json"
VALID_SLOTS = {"flower", "plume", "sands", "goblet", "circlet"}
VARIABLE_MAIN_STAT_SLOTS = {"sands", "goblet", "circlet"}

CRIT_RATE_KEYS = {"critrate", "critrate_", "crit rate", "шанс крит попадания", "шанс крит"}
CRIT_DMG_KEYS = {"critdmg", "critdmg_", "crit dmg", "crit damage", "крит урон"}


def recommend_best_artifacts(
    character_id: str,
    slot: str,
    inventory_file: str | Path = "data/processed/artifacts.json",
) -> str:
    """Recommend top free artifacts for one slot using CV and useful stat synergy."""

    normalized_slot = normalize_slot(slot)
    if normalized_slot not in VALID_SLOTS:
        return (
            f"Слот '{slot}' не поддерживается. Используйте один из: "
            "flower, plume, sands, goblet, circlet."
        )

    resolved_character_id = resolve_character_id(character_id) or normalize_id(character_id)
    builds = load_json_object(DEFAULT_BUILDS_PATH)
    build = builds.get(resolved_character_id) if isinstance(builds, dict) else None
    if not isinstance(build, dict):
        return f"Для персонажа '{resolved_character_id}' билд не настроен в data/character_builds.json."

    useful_stats = normalize_build_stats(build.get("stats", []))
    if not useful_stats:
        return f"Для персонажа '{resolved_character_id}' в билде не заполнен список полезных статов stats."

    inventory_path = resolve_inventory_path(inventory_file)
    if not inventory_path.exists():
        return f"Файл инвентаря '{inventory_path}' не найден."

    inventory = load_json_data(inventory_path)
    artifacts = inventory if isinstance(inventory, list) else inventory.get("artifacts", []) if isinstance(inventory, dict) else []
    if not isinstance(artifacts, list):
        return f"Файл инвентаря '{inventory_path}' не содержит список artifacts."

    character_names = build_character_location_names(resolved_character_id)
    candidates: list[dict[str, Any]] = []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        if normalize_slot(artifact.get("slotKey") or artifact.get("slot") or artifact.get("equipType")) != normalized_slot:
            continue
        if not is_artifact_available_for_character(artifact, character_names):
            continue

        score_data = score_artifact(artifact, normalized_slot, useful_stats)
        if score_data["score"] <= 0:
            continue
        candidates.append({"artifact": artifact, **score_data})

    if not candidates:
        return (
            f"Для '{resolved_character_id}' не найдено свободных артефактов в слоте "
            f"'{normalized_slot}', которые подходят под полезные статы билда."
        )

    candidates.sort(
        key=lambda item: (
            item["score"],
            item["cv"],
            int(item["artifact"].get("level") or 0),
            int(item["artifact"].get("rarity") or 0),
        ),
        reverse=True,
    )
    return format_artifact_recommendations(resolved_character_id, normalized_slot, useful_stats, candidates[:3])


def score_artifact(artifact: dict[str, Any], slot: str, useful_stats: set[str]) -> dict[str, Any]:
    substats = extract_substats(artifact)
    main_stat = stat_name(artifact.get("mainStatKey") or artifact.get("mainStat") or artifact.get("main_stat"))
    normalized_main = normalize_stat(main_stat)

    crit_rate = sum(stat_value_as_percent(value) for name, value in substats if normalize_stat(name) == "crit_rate")
    crit_dmg = sum(stat_value_as_percent(value) for name, value in substats if normalize_stat(name) == "crit_dmg")
    cv = crit_rate * 2 + crit_dmg

    rv_points = 0.0
    useful_hits: list[str] = []
    for name, value in substats:
        normalized = normalize_stat(name)
        if normalized not in useful_stats:
            continue

        weight = stat_weight(normalized)
        numeric_value = stat_value_as_percent(value) if is_percent_like_stat(normalized) else safe_float(value)
        rv_points += weight * max(numeric_value, 1.0)
        useful_hits.append(f"{stat_name(name)} {format_stat_value(value, normalized)}")

    main_bonus = 0.0
    main_note = "фиксированный мейн-стат"
    if slot in VARIABLE_MAIN_STAT_SLOTS:
        if normalized_main in useful_stats or is_elemental_damage_stat(normalized_main):
            main_bonus = 25.0
            main_note = f"мейн-стат подходит: {main_stat}"
        else:
            main_bonus = -35.0
            main_note = f"мейн-стат не из списка приоритетов: {main_stat or 'не найден'}"

    score = cv + rv_points + main_bonus
    reasons = []
    if cv:
        reasons.append(f"CV {cv:.1f}")
    if useful_hits:
        reasons.append("полезные сабстаты: " + ", ".join(useful_hits))
    reasons.append(main_note)

    return {
        "score": round(score, 2),
        "cv": round(cv, 1),
        "rv": round(rv_points, 1),
        "main_stat": main_stat or "Не найдено",
        "substats": substats,
        "reasons": reasons,
    }


def format_artifact_recommendations(
    character_id: str,
    slot: str,
    useful_stats: set[str],
    candidates: list[dict[str, Any]],
) -> str:
    lines = [
        f"Рекомендации артефактов для {character_id}",
        f"Слот: {slot}",
        "Полезные статы билда: " + ", ".join(sorted(useful_stats)),
        "",
    ]

    for index, candidate in enumerate(candidates, start=1):
        artifact = candidate["artifact"]
        set_name = artifact.get("set_id") or artifact.get("setKey") or artifact.get("set") or artifact.get("setName") or "Не найдено"
        level = artifact.get("level", "?")
        rarity = artifact.get("rarity", "?")
        substats = format_substats(candidate["substats"])
        reasons = "; ".join(candidate["reasons"])
        verdict = build_verdict(candidate)

        lines.extend(
            [
                f"{index}. {set_name} (+{level}, {rarity} звезд)",
                f"   Мейн-стат: {candidate['main_stat']}",
                f"   CV: {candidate['cv']:.1f}; RV: {candidate['rv']:.1f}; итоговый скор: {candidate['score']:.1f}",
                f"   Сабстаты: {substats}",
                f"   Почему подходит: {reasons}. {verdict}",
            ]
        )

    return "\n".join(lines)


def build_verdict(candidate: dict[str, Any]) -> str:
    if candidate["score"] >= 70:
        return "Вердикт: очень сильный вариант."
    if candidate["score"] >= 45:
        return "Вердикт: хороший рабочий вариант."
    return "Вердикт: можно использовать временно, но стоит искать лучше."


def extract_substats(artifact: dict[str, Any]) -> list[tuple[str, Any]]:
    raw_substats = artifact.get("substats", [])
    if isinstance(raw_substats, list):
        result: list[tuple[str, Any]] = []
        for item in raw_substats:
            if isinstance(item, dict):
                result.append((str(item.get("key") or item.get("statKey") or item.get("name") or ""), item.get("value", 0)))
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                result.append((str(item[0]), item[1]))
        return result

    if isinstance(raw_substats, dict):
        return [(str(key), value) for key, value in raw_substats.items()]

    return []


def normalize_build_stats(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {normalize_stat(item) for item in value if normalize_stat(item)}


def normalize_stat(value: Any) -> str:
    raw = str(value or "").strip()
    normalized = re.sub(r"[\W_]+", " ", raw.casefold(), flags=re.UNICODE).strip()
    compact = normalized.replace(" ", "")

    if compact in {"critrate", "criticalrate"} or "шанс крит" in normalized:
        return "crit_rate"
    if compact in {"critdmg", "critdamage", "criticaldamage"} or "крит урон" in normalized:
        return "crit_dmg"
    if compact in {"enerrech", "energyrecharge", "recharge", "er"} or "восстанов" in normalized:
        return "energy_recharge"
    if compact in {"elemas", "elementalmastery", "em", "mastery"} or "мастерство" in normalized:
        return "elemental_mastery"
    if compact in {"atk", "atkpercent", "atkpercentage", "attack"} or "атака" in normalized:
        return "atk"
    if compact in {"hp", "hppercent", "hppercentage"} or normalized == "hp":
        return "hp"
    if compact in {"def", "defpercent", "defpercentage", "defense"} or "защит" in normalized:
        return "def"
    if "healing" in normalized or "лечение" in normalized:
        return "healing_bonus"
    if "dmg" in normalized or "damage" in normalized or "урон" in normalized:
        return normalized.replace(" ", "_")
    return normalized.replace(" ", "_")


def stat_name(value: Any) -> str:
    mapping = {
        "critRate_": "CRIT Rate",
        "critDMG_": "CRIT DMG",
        "enerRech_": "Energy Recharge",
        "eleMas": "Elemental Mastery",
        "atk_": "ATK%",
        "hp_": "HP%",
        "def_": "DEF%",
        "atk": "Flat ATK",
        "hp": "Flat HP",
        "def": "Flat DEF",
    }
    return mapping.get(str(value or ""), str(value or ""))


def stat_weight(normalized_stat: str) -> float:
    if normalized_stat in {"crit_rate", "crit_dmg"}:
        return 1.0
    if normalized_stat in {"energy_recharge", "elemental_mastery", "atk", "hp", "def"}:
        return 0.8
    return 0.6


def is_percent_like_stat(normalized_stat: str) -> bool:
    return normalized_stat in {"crit_rate", "crit_dmg", "energy_recharge", "atk", "hp", "def"} or normalized_stat.endswith("_dmg")


def is_elemental_damage_stat(normalized_stat: str) -> bool:
    return normalized_stat.endswith("_dmg") or "elemental" in normalized_stat and "damage" in normalized_stat


def stat_value_as_percent(value: Any) -> float:
    numeric = safe_float(value)
    if 0 < abs(numeric) < 1:
        return numeric * 100
    return numeric


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def format_stat_value(value: Any, normalized_stat: str) -> str:
    numeric = safe_float(value)
    if is_percent_like_stat(normalized_stat):
        return f"{stat_value_as_percent(value):.1f}%"
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:.1f}"


def format_substats(substats: list[tuple[str, Any]]) -> str:
    if not substats:
        return "Не найдены"
    parts = []
    for name, value in substats:
        normalized = normalize_stat(name)
        parts.append(f"{stat_name(name)} {format_stat_value(value, normalized)}")
    return ", ".join(parts)


def normalize_slot(value: Any) -> str:
    raw = str(value or "").casefold().strip()
    compact = re.sub(r"[\W_]+", "", raw, flags=re.UNICODE)
    aliases = {
        "flower": "flower",
        "floweroflife": "flower",
        "equipbracer": "flower",
        "plume": "plume",
        "feather": "plume",
        "plumeofdeath": "plume",
        "equipnecklace": "plume",
        "sands": "sands",
        "sandsofeon": "sands",
        "equipshoes": "sands",
        "goblet": "goblet",
        "gobletofeonothem": "goblet",
        "equipring": "goblet",
        "circlet": "circlet",
        "circletoflogos": "circlet",
        "equipdress": "circlet",
    }
    return aliases.get(compact, raw)


def is_artifact_available_for_character(artifact: dict[str, Any], character_names: set[str]) -> bool:
    location = normalize_location(artifact.get("location", ""))
    return not location or location in character_names


def build_character_location_names(character_id: str) -> set[str]:
    compact = re.sub(r"[\W_]+", "", character_id.casefold(), flags=re.UNICODE)
    names = {normalize_location(character_id), compact}
    character_path = PROJECT_ROOT / "knowledge_base" / "characters" / f"{character_id}.json"
    data = load_json_object(character_path)
    for key in ("id", "name_en", "name_ru"):
        value = data.get(key)
        if value:
            names.add(normalize_location(value))
    return names


def normalize_location(value: Any) -> str:
    return re.sub(r"[\W_]+", "", str(value or "").casefold(), flags=re.UNICODE)


def load_json_object(path: Path) -> dict[str, Any]:
    data = load_json_data(path)
    return data if isinstance(data, dict) else {}


def load_json_data(path: Path) -> Any:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data


def resolve_inventory_path(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.is_absolute():
        return candidate

    project_candidate = PROJECT_ROOT / candidate
    if project_candidate.exists():
        return project_candidate

    root_inventory = PROJECT_ROOT / "inventory.json"
    if str(path).replace("\\", "/") == "data/inventory.json" and root_inventory.exists():
        return root_inventory

    raw_inventory = PROJECT_ROOT / "data" / "raw" / "inventory.json"
    if str(path).replace("\\", "/") == "data/inventory.json" and raw_inventory.exists():
        return raw_inventory

    return project_candidate
