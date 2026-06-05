"""Calculate current character stats from processed profile, weapon and artifacts."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.tools.artifact_scorer import extract_substats, normalize_stat, stat_value_as_percent
from scripts.tools.calculator import PROJECT_ROOT, resolve_character_id
from scripts.tools.weapon_info import get_weapon_record, load_weapons_db


PROCESSED_CHARACTERS_PATH = PROJECT_ROOT / "data" / "processed" / "characters.json"
CHARACTERS_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
ARTIFACTS_DIR = PROJECT_ROOT / "knowledge_base" / "artifacts"

MAIN_STAT_5_STAR_LEVEL_20 = {
    "hp": 4780.0,
    "atk": 311.0,
    "hp_": 0.466,
    "atk_": 0.466,
    "def_": 0.583,
    "eleMas": 187.0,
    "enerRech_": 0.518,
    "critRate_": 0.311,
    "critDMG_": 0.622,
    "heal_": 0.359,
    "*_dmg_": 0.466,
    "physical_dmg_": 0.583,
}

MAIN_STAT_MAX_VALUES = {
    5: {
        **MAIN_STAT_5_STAR_LEVEL_20,
        "pyro_dmg_": 0.466,
        "hydro_dmg_": 0.466,
        "cryo_dmg_": 0.466,
        "electro_dmg_": 0.466,
        "anemo_dmg_": 0.466,
        "geo_dmg_": 0.466,
        "dendro_dmg_": 0.466,
        "physical_dmg_": 0.583,
    },
    4: {
        "hp": 3571.0,
        "atk": 232.0,
        "hp_": 0.348,
        "atk_": 0.348,
        "def_": 0.435,
        "eleMas": 139.0,
        "enerRech_": 0.387,
        "critRate_": 0.232,
        "critDMG_": 0.464,
        "heal_": 0.268,
        "pyro_dmg_": 0.348,
        "hydro_dmg_": 0.348,
        "cryo_dmg_": 0.348,
        "electro_dmg_": 0.348,
        "anemo_dmg_": 0.348,
        "geo_dmg_": 0.348,
        "dendro_dmg_": 0.348,
        "physical_dmg_": 0.435,
    },
}

ARTIFACT_MAX_LEVEL_BY_RARITY = {5: 20, 4: 16, 3: 12, 2: 4, 1: 4}

STAT_LABELS = {
    "hp": "HP",
    "atk": "АТК",
    "def": "DEF",
    "crit_rate": "Шанс крит. попадания",
    "crit_dmg": "Крит. урон",
    "energy_recharge": "Восстановление энергии",
    "elemental_mastery": "Мастерство стихий",
    "healing_bonus": "Бонус лечения",
    "physical_dmg": "Бонус физ. урона",
    "pyro_dmg": "Пиро урон",
    "hydro_dmg": "Гидро урон",
    "cryo_dmg": "Крио урон",
    "electro_dmg": "Электро урон",
    "anemo_dmg": "Анемо урон",
    "geo_dmg": "Гео урон",
    "dendro_dmg": "Дендро урон",
}

ASCENSION_SUBSTAT_BY_TYPE = {
    "FIGHT_PROP_ATTACK_PERCENT": "atk_pct",
    "FIGHT_PROP_HP_PERCENT": "hp_pct",
    "FIGHT_PROP_DEFENSE_PERCENT": "def_pct",
    "FIGHT_PROP_CRITICAL": "crit_rate",
    "FIGHT_PROP_CRITICAL_HURT": "crit_dmg",
    "FIGHT_PROP_CHARGE_EFFICIENCY": "energy_recharge",
    "FIGHT_PROP_ELEMENT_MASTERY": "elemental_mastery",
    "FIGHT_PROP_HEAL_ADD": "healing_bonus",
    "FIGHT_PROP_PHYSICAL_ADD_HURT": "physical_dmg",
    "FIGHT_PROP_FIRE_ADD_HURT": "pyro_dmg",
    "FIGHT_PROP_WATER_ADD_HURT": "hydro_dmg",
    "FIGHT_PROP_ICE_ADD_HURT": "cryo_dmg",
    "FIGHT_PROP_ELEC_ADD_HURT": "electro_dmg",
    "FIGHT_PROP_WIND_ADD_HURT": "anemo_dmg",
    "FIGHT_PROP_ROCK_ADD_HURT": "geo_dmg",
    "FIGHT_PROP_GRASS_ADD_HURT": "dendro_dmg",
}

WEAPON_PASSIVE_STATS = {
    "tome-of-the-eternal-flow": {"hp_": 0.16},
    "staff-of-homa": {"hp_": 0.20},
    "primordial-jade-winged-spear": {"atk_": 0.032},
    "primordial-jade-cutter": {"hp_": 0.20},
    "elegy-for-the-end": {"enerRech_": 0.0},
}

SET_BONUSES = {
    "gladiators-finale": {"atk_": 0.18},
    "shimenawas-reminiscence": {"atk_": 0.18},
    "vermillion-hereafter": {"atk_": 0.18},
    "echoes-of-an-offering": {"atk_": 0.18},
    "nighttime-whispers-in-the-echoing-woods": {"atk_": 0.18},
    "fragment-of-harmonic-whimsy": {"atk_": 0.18},
    "night-of-the-skys-unveiling": {"atk_": 0.18},
    "tenacity-of-the-millelith": {"hp_": 0.20},
    "vourukashas-glow": {"hp_": 0.20},
    "emblem-of-severed-fate": {"enerRech_": 0.20},
    "wanderers-troupe": {"eleMas": 80.0},
    "gilded-dreams": {"eleMas": 80.0},
    "flower-of-paradise-lost": {"eleMas": 80.0},
    "viridescent-venerer": {"anemo_dmg_": 0.15},
    "desert-pavilion-chronicle": {"anemo_dmg_": 0.15},
}


def calculate_character_full_stats(character_id: str) -> str:
    """Calculate current visible stats using processed account equipment."""

    resolved_id = resolve_character_id(character_id) or slugify(character_id)
    if not resolved_id:
        return "Не указан персонаж."

    processed_characters = load_json_object(PROCESSED_CHARACTERS_PATH)
    profile = processed_characters.get(resolved_id)
    if not isinstance(profile, dict):
        return f"Персонаж '{character_id}' ({resolved_id}) не найден в data/processed/characters.json."

    kb_path = CHARACTERS_DIR / f"{resolved_id}.json"
    character_kb = load_json_object(kb_path)
    if not character_kb:
        return f"Эталонные данные персонажа '{resolved_id}' не найдены в knowledge_base/characters."

    level = safe_int(profile.get("level"), 1)
    character_base = interpolate_progression(character_kb.get("stats", {}).get("progression", []), level)
    constants = character_kb.get("stats", {}).get("base_stats_constants", {})

    weapon = profile.get("equipped_weapon") if isinstance(profile.get("equipped_weapon"), dict) else {}
    weapon_stats = calculate_weapon_stats(weapon)
    equipped_artifacts = profile.get("equipped_artifacts", [])
    artifact_stats = collect_artifact_stats(equipped_artifacts)
    set_bonuses = calculate_artifact_set_bonuses(equipped_artifacts)
    artifact_stats = merge_bonus_buckets(artifact_stats, set_bonuses)

    ascension_bonuses = classify_ascension_bonus(character_kb.get("substat", {}), character_base.get("ascension_bonus", 0))
    weapon_bonuses = merge_bonus_buckets(
        classify_weapon_substat(weapon_stats),
        get_weapon_passive_bonuses(weapon),
    )

    char_hp = character_base.get("hp", 0.0)
    char_atk = character_base.get("atk", 0.0)
    char_def = character_base.get("def", 0.0)
    weapon_atk = weapon_stats.get("base_atk", 0.0)

    base_atk = char_atk + weapon_atk
    total_hp = char_hp * (
        1 + artifact_stats["hp_pct"] + weapon_bonuses["hp_pct"] + ascension_bonuses["hp_pct"]
    ) + artifact_stats["hp_flat"]
    total_atk = base_atk * (
        1 + artifact_stats["atk_pct"] + weapon_bonuses["atk_pct"] + ascension_bonuses["atk_pct"]
    ) + artifact_stats["atk_flat"]
    total_def = char_def * (
        1 + artifact_stats["def_pct"] + weapon_bonuses["def_pct"] + ascension_bonuses["def_pct"]
    ) + artifact_stats["def_flat"]

    base_crit_rate = as_float(constants.get("crit_rate"), 0.0)
    base_crit_dmg = as_float(constants.get("crit_dmg"), 0.5)
    base_energy_recharge = as_float(constants.get("energy_recharge"), 1.0)
    total_crit_rate = base_crit_rate + ascension_bonuses["crit_rate"] + weapon_bonuses["crit_rate"] + artifact_stats["crit_rate"]
    total_crit_dmg = base_crit_dmg + ascension_bonuses["crit_dmg"] + weapon_bonuses["crit_dmg"] + artifact_stats["crit_dmg"]
    total_er = base_energy_recharge + ascension_bonuses["energy_recharge"] + weapon_bonuses["energy_recharge"] + artifact_stats["energy_recharge"]
    total_em = ascension_bonuses["elemental_mastery"] + weapon_bonuses["elemental_mastery"] + artifact_stats["elemental_mastery"]

    extra_bonuses = build_extra_bonus_lines(ascension_bonuses, weapon_bonuses, artifact_stats)
    artifact_cv = artifact_stats["crit_rate"] * 200 + artifact_stats["crit_dmg"] * 100

    display_name = profile.get("name_ru") or character_kb.get("name_ru") or character_kb.get("name_en") or resolved_id
    lines = [
        f"# Характеристики: {display_name} ({resolved_id})",
        "",
        f"- Уровень персонажа: {level}",
        f"- Оружие: {weapon.get('name') or weapon.get('name_ru') or weapon.get('name_en') or weapon.get('id') or 'Не надето'} "
        f"(ур. {weapon.get('level', '?')})",
        "",
        "## Основные статы",
        format_total_line("HP", total_hp, char_hp, total_hp - char_hp),
        format_total_line("АТК", total_atk, base_atk, total_atk - base_atk),
        format_total_line("DEF", total_def, char_def, total_def - char_def),
        "",
        "## Боевые параметры",
        f"- Шанс крит. попадания: {format_percent(total_crit_rate)}",
        f"- Крит. урон: {format_percent(total_crit_dmg)}",
        f"- Восстановление энергии: {format_percent(total_er)}",
        f"- Мастерство стихий: {round(total_em)}",
        f"- CV артефактов: {artifact_cv:.1f}",
    ]

    if extra_bonuses:
        lines.extend(["", "## Дополнительные бонусы", *extra_bonuses])

    lines.extend(["", "## Артефакты"])
    lines.extend(format_artifact_breakdown(equipped_artifacts))
    return "\n".join(lines)


def calculate_weapon_stats(weapon: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(weapon, dict) or not weapon:
        return {"base_atk": 0.0, "secondary_stat": "", "secondary_stat_value": 0.0}

    weapons_db = load_weapons_db()
    weapon_id = str(weapon.get("id") or "").strip()
    weapon_record = get_weapon_record(weapon_id, weapons_db) if weapon_id else None
    if not weapon_record:
        return {"base_atk": 0.0, "secondary_stat": "", "secondary_stat_value": 0.0}

    level = safe_int(weapon.get("level"), 1)
    stats = weapon_record.get("stats", {})
    interpolated = interpolate_weapon_stats(stats, level)
    return {
        "base_atk": interpolated.get("base_atk", 0.0),
        "secondary_stat": interpolated.get("secondary_stat", ""),
        "secondary_stat_value": interpolated.get("secondary_stat_value", 0.0),
        "secondary_stat_key": interpolated.get("secondary_stat_key", ""),
    }


def interpolate_progression(progression: Any, level: int) -> dict[str, float]:
    points = [point for point in progression if isinstance(point, dict) and "level" in point]
    if not points:
        return {"hp": 0.0, "atk": 0.0, "def": 0.0, "ascension_bonus": 0.0}

    points.sort(key=lambda point: (safe_int(point.get("level")), safe_int(point.get("ascension"))))
    level_points = [point for point in points if safe_int(point.get("level")) == level]
    if level_points:
        return numeric_stats(level_points[-1])

    lower = points[0]
    upper = points[-1]
    for index, point in enumerate(points):
        if safe_int(point.get("level")) < level:
            lower = point
        elif safe_int(point.get("level")) > level:
            upper = point
            break

    lower_level = safe_int(lower.get("level"))
    upper_level = safe_int(upper.get("level"))
    if upper_level == lower_level:
        return numeric_stats(upper)

    ratio = (level - lower_level) / (upper_level - lower_level)
    return {
        key: lerp(as_float(lower.get(key)), as_float(upper.get(key)), ratio)
        for key in ("hp", "atk", "def", "ascension_bonus")
    }


def interpolate_weapon_stats(stats: Any, level: int) -> dict[str, Any]:
    if not isinstance(stats, dict):
        return {"base_atk": 0.0, "secondary_stat": "", "secondary_stat_value": 0.0}

    points: list[dict[str, Any]] = []
    for key, value in stats.items():
        if not isinstance(value, dict):
            continue
        match = re.search(r"(\d+)", str(key))
        if not match:
            continue
        points.append({"level": int(match.group(1)), **normalize_weapon_stat_point(value)})

    if not points:
        return {"base_atk": 0.0, "secondary_stat": "", "secondary_stat_value": 0.0}

    points.sort(key=lambda point: point["level"])
    if len(points) == 1:
        return points[0]

    lower = points[0]
    upper = points[-1]
    for point in points:
        if point["level"] <= level:
            lower = point
        if point["level"] >= level:
            upper = point
            break

    if lower["level"] == upper["level"]:
        return lower

    ratio = (level - lower["level"]) / (upper["level"] - lower["level"])
    return {
        "base_atk": lerp(as_float(lower.get("base_atk")), as_float(upper.get("base_atk")), ratio),
        "secondary_stat": upper.get("secondary_stat") or lower.get("secondary_stat") or "",
        "secondary_stat_key": upper.get("secondary_stat_key") or lower.get("secondary_stat_key") or "",
        "secondary_stat_value": lerp(
            as_float(lower.get("secondary_stat_value")),
            as_float(upper.get("secondary_stat_value")),
            ratio,
        ),
    }


def normalize_weapon_stat_point(point: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(point)
    normalized["base_atk"] = point.get("base_atk", point.get("atk", point.get("attack", 0.0)))
    if point.get("secondary_stat_key"):
        return normalized

    ignored_keys = {"level", "base_atk", "atk", "attack", "secondary_stat", "secondary_stat_value"}
    for key, value in point.items():
        if key in ignored_keys or not isinstance(value, (int, float)):
            continue
        if infer_stat_bucket(key):
            normalized["secondary_stat_key"] = key
            normalized["secondary_stat_value"] = value
            break
    return normalized


def collect_artifact_stats(artifacts: Any) -> dict[str, float]:
    totals = empty_bonus_bucket()
    if not isinstance(artifacts, list):
        return totals

    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        add_artifact_main_stat(totals, artifact)
        for key, value in extract_substats(artifact):
            add_stat_value(totals, key, value)
    return totals


def calculate_artifact_set_bonuses(artifacts: Any) -> dict[str, float]:
    bonuses = empty_bonus_bucket()
    if not isinstance(artifacts, list):
        return bonuses

    set_counts: dict[str, int] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        set_id = get_artifact_set_id(artifact)
        if set_id:
            set_counts[set_id] = set_counts.get(set_id, 0) + 1

    for set_id, count in set_counts.items():
        if count < 2:
            continue
        for stat_key, value in SET_BONUSES.get(set_id, {}).items():
            add_stat_value(bonuses, stat_key, value)
    return bonuses


def add_artifact_main_stat(totals: dict[str, float], artifact: dict[str, Any]) -> None:
    key = normalize_main_stat_key(artifact.get("main_stat") or artifact.get("mainStatKey") or artifact.get("mainStat"))
    if not key:
        return
    rarity = safe_int(artifact.get("rarity"), 5)
    level = max(0, safe_int(artifact.get("level"), 0))
    max_value = get_main_stat_max_value(key, rarity)
    if max_value is None:
        return

    max_level = ARTIFACT_MAX_LEVEL_BY_RARITY.get(rarity, 20)
    value = max_value * min(level, max_level) / max_level if max_level else max_value
    add_stat_value(totals, key, value)


def normalize_main_stat_key(value: Any) -> str:
    key = str(value or "").strip()
    if key:
        return key
    return ""


def get_main_stat_max_value(key: str, rarity: int) -> float | None:
    values = MAIN_STAT_MAX_VALUES.get(rarity, MAIN_STAT_MAX_VALUES[5])
    if key in values:
        return values[key]
    if key.endswith("_dmg_") and key != "physical_dmg_":
        return values.get("*_dmg_")
    return None


def add_stat_value(totals: dict[str, float], raw_key: Any, raw_value: Any) -> None:
    value = as_float(raw_value)
    key = str(raw_key or "")
    normalized = normalize_stat(key)

    if normalized == "crit_rate":
        totals["crit_rate"] += value_to_ratio(value)
    elif normalized == "crit_dmg":
        totals["crit_dmg"] += value_to_ratio(value)
    elif normalized == "energy_recharge":
        totals["energy_recharge"] += value_to_ratio(value)
    elif normalized == "elemental_mastery":
        totals["elemental_mastery"] += value
    elif normalized == "atk":
        if key.endswith("_"):
            totals["atk_pct"] += value_to_ratio(value)
        else:
            totals["atk_flat"] += value
    elif normalized == "hp":
        if key.endswith("_"):
            totals["hp_pct"] += value_to_ratio(value)
        else:
            totals["hp_flat"] += value
    elif normalized == "def":
        if key.endswith("_"):
            totals["def_pct"] += value_to_ratio(value)
        else:
            totals["def_flat"] += value
    elif normalized == "healing_bonus":
        totals["healing_bonus"] += value_to_ratio(value)
    elif normalized.endswith("_dmg") or normalized in {"physical_dmg"}:
        totals[normalized] = totals.get(normalized, 0.0) + value_to_ratio(value)


def classify_ascension_bonus(substat: Any, value: Any) -> dict[str, float]:
    bonuses = empty_bonus_bucket()
    if not isinstance(substat, dict):
        return bonuses
    bonus_key = ASCENSION_SUBSTAT_BY_TYPE.get(str(substat.get("type") or ""))
    if not bonus_key:
        bonus_key = infer_stat_bucket(substat.get("name_en") or substat.get("name_ru"))
    if bonus_key:
        bonuses[bonus_key] = as_float(value)
    return bonuses


def classify_weapon_substat(weapon_stats: dict[str, Any]) -> dict[str, float]:
    bonuses = empty_bonus_bucket()
    stat_key = infer_stat_bucket(weapon_stats.get("secondary_stat_key")) or infer_stat_bucket(weapon_stats.get("secondary_stat"))
    if stat_key:
        bonuses[stat_key] = as_float(weapon_stats.get("secondary_stat_value"))
    return bonuses


def get_weapon_passive_bonuses(weapon: dict[str, Any]) -> dict[str, float]:
    bonuses = empty_bonus_bucket()
    if not isinstance(weapon, dict):
        return bonuses

    weapon_id = str(weapon.get("id") or "").strip()
    passive_stats = WEAPON_PASSIVE_STATS.get(weapon_id, {})
    for stat_key, value in passive_stats.items():
        add_stat_value(bonuses, stat_key, value)
    return bonuses


def merge_bonus_buckets(*buckets: dict[str, float]) -> dict[str, float]:
    merged = empty_bonus_bucket()
    for bucket in buckets:
        for key, value in bucket.items():
            merged[key] = merged.get(key, 0.0) + value
    return merged


def infer_stat_bucket(value: Any) -> str:
    text = str(value or "").casefold()
    compact = re.sub(r"[\W_]+", "", text, flags=re.UNICODE)
    if "critrate" in compact or "шанкрит" in compact:
        return "crit_rate"
    if "critdmg" in compact or "critdamage" in compact or "критурон" in compact:
        return "crit_dmg"
    if "energyrecharge" in compact or "восст" in compact:
        return "energy_recharge"
    if "elementalmastery" in compact or "мастерствостих" in compact:
        return "elemental_mastery"
    if compact in {"atk", "attack"} or "силаатаки" in compact:
        return "atk_pct"
    if compact == "hp":
        return "hp_pct"
    if compact in {"def", "defense"} or "защит" in compact:
        return "def_pct"
    if "healing" in compact or "лечен" in compact:
        return "healing_bonus"
    if "physical" in compact or "физ" in compact:
        return "physical_dmg"
    for element in ("pyro", "hydro", "cryo", "electro", "anemo", "geo", "dendro"):
        if element in compact:
            return f"{element}_dmg"
    return ""


def infer_stat_bucket(value: Any) -> str:
    text = repair_text(value).casefold()
    compact = re.sub(r"[\W_]+", "", text, flags=re.UNICODE)
    if "critrate" in compact or "criticalrate" in compact or "шанкрит" in compact or "критпопад" in compact:
        return "crit_rate"
    if "critdmg" in compact or "critdamage" in compact or "критурон" in compact:
        return "crit_dmg"
    if "energyrecharge" in compact or "восст" in compact:
        return "energy_recharge"
    if "elementalmastery" in compact or "мастерствостих" in compact:
        return "elemental_mastery"
    if compact in {"atk", "attack"} or "силаатаки" in compact:
        return "atk_pct"
    if compact == "hp":
        return "hp_pct"
    if compact in {"def", "defense"} or "защит" in compact:
        return "def_pct"
    if "healing" in compact or "лечен" in compact:
        return "healing_bonus"
    if "physical" in compact or "физ" in compact:
        return "physical_dmg"
    for element in ("pyro", "hydro", "cryo", "electro", "anemo", "geo", "dendro"):
        if element in compact:
            return f"{element}_dmg"
    return ""


def repair_text(value: Any) -> str:
    text = str(value or "")
    try:
        repaired = text.encode("cp1251").decode("utf-8")
    except UnicodeError:
        return text
    return repaired if repaired else text


def build_extra_bonus_lines(*buckets: dict[str, float]) -> list[str]:
    totals: dict[str, float] = {}
    for bucket in buckets:
        for key, value in bucket.items():
            if key in {
                "hp_flat",
                "atk_flat",
                "def_flat",
                "hp_pct",
                "atk_pct",
                "def_pct",
                "crit_rate",
                "crit_dmg",
                "energy_recharge",
                "elemental_mastery",
            }:
                continue
            if value:
                totals[key] = totals.get(key, 0.0) + value

    return [f"- {STAT_LABELS.get(key, key)}: {format_percent(value)}" for key, value in sorted(totals.items())]


def get_artifact_set_id(artifact: dict[str, Any]) -> str:
    for key in ("set_name", "set_id", "source_set_key", "setKey", "set"):
        raw_value = artifact.get(key)
        if raw_value:
            return slugify(raw_value)
    return ""


def get_artifact_set_display_name(artifact: dict[str, Any]) -> str:
    set_id = get_artifact_set_id(artifact)
    if not set_id:
        return "СЃРµС‚ РЅРµ РЅР°Р№РґРµРЅ"

    artifact_record = load_json_object(ARTIFACTS_DIR / f"{set_id}.json")
    return artifact_record.get("name_ru") or artifact_record.get("name_en") or set_id


def format_artifact_breakdown(artifacts: Any) -> list[str]:
    if not isinstance(artifacts, list) or not artifacts:
        return ["- Не надеты"]

    names = {"flower": "Цветок", "plume": "Перо", "sands": "Часы", "goblet": "Кубок", "circlet": "Шапка"}
    lines: list[str] = []
    for artifact in sorted(artifacts, key=lambda item: slot_order(item.get("slot") or item.get("slotKey"))):
        slot = normalize_slot(str(artifact.get("slot") or artifact.get("slotKey") or ""))
        substats = extract_substats(artifact)
        cv = sum(stat_value_as_percent(v) for k, v in substats if normalize_stat(k) == "crit_rate") * 2
        cv += sum(stat_value_as_percent(v) for k, v in substats if normalize_stat(k) == "crit_dmg")
        artifact = {**artifact, "set_id": get_artifact_set_display_name(artifact)}
        lines.append(
            f"- {names.get(slot, slot)}: {artifact.get('set_id') or artifact.get('source_set_key') or 'сет не найден'}, "
            f"+{artifact.get('level', '?')}, мейн {artifact.get('main_stat') or artifact.get('mainStatKey') or '?'}, CV {cv:.1f}"
        )
    return lines


def empty_bonus_bucket() -> dict[str, float]:
    return {
        "hp_flat": 0.0,
        "atk_flat": 0.0,
        "def_flat": 0.0,
        "hp_pct": 0.0,
        "atk_pct": 0.0,
        "def_pct": 0.0,
        "crit_rate": 0.0,
        "crit_dmg": 0.0,
        "energy_recharge": 0.0,
        "elemental_mastery": 0.0,
        "healing_bonus": 0.0,
        "physical_dmg": 0.0,
        "pyro_dmg": 0.0,
        "hydro_dmg": 0.0,
        "cryo_dmg": 0.0,
        "electro_dmg": 0.0,
        "anemo_dmg": 0.0,
        "geo_dmg": 0.0,
        "dendro_dmg": 0.0,
    }


def numeric_stats(point: dict[str, Any]) -> dict[str, float]:
    return {key: as_float(point.get(key)) for key in ("hp", "atk", "def", "ascension_bonus")}


def value_to_ratio(value: float) -> float:
    return value / 100 if abs(value) > 1 else value


def format_total_line(label: str, total: float, base: float, green: float) -> str:
    return f"- {label}: {round(total)} ({round(base)} + {round(green)})"


def format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


def slot_order(slot: Any) -> int:
    order = {"flower": 0, "plume": 1, "sands": 2, "goblet": 3, "circlet": 4}
    return order.get(normalize_slot(str(slot or "")), 99)


def normalize_slot(value: str) -> str:
    compact = re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)
    return {
        "flower": "flower",
        "equipbracer": "flower",
        "plume": "plume",
        "equipnecklace": "plume",
        "sands": "sands",
        "equipshoes": "sands",
        "goblet": "goblet",
        "equipring": "goblet",
        "circlet": "circlet",
        "equipdress": "circlet",
    }.get(compact, value)


def lerp(start: float, end: float, ratio: float) -> float:
    return start + (end - start) * ratio


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def slugify(value: Any) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").strip().lower()).strip("-")
