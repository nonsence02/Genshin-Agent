"""Deterministic resource calculator tools for Genshin-Agent.

This module must not call an LLM. It reads structured JSON knowledge base files
and the raw Inventory Camera GOOD JSON, then returns strict JSON-compatible
Python dictionaries.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CHARACTER_KB_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
ROOT_INVENTORY_PATH = PROJECT_ROOT / "inventory.json"
RAW_INVENTORY_PATH = PROJECT_ROOT / "data" / "raw" / "inventory.json"
DEFAULT_INVENTORY_PATH = ROOT_INVENTORY_PATH
DEFAULT_DICTIONARY_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"
DEFAULT_MATERIAL_KB_DIR = PROJECT_ROOT / "knowledge_base" / "materials"

CHARACTER_ALIASES_RU: dict[str, str] = {
    "айно": "aino",
    "рейзор": "razor",
    "рэйзор": "razor",
    "ризли": "wriothesley",
    "вриотесли": "wriothesley",
    "риотесли": "wriothesley",
    "флинс": "flins",
    "шеврез": "chevreuse",
    "шеврёз": "chevreuse",
    "ху тао": "hu-tao",
    "хутао": "hu-tao",
}

TARGET_ASCENSION = 6
TARGET_TALENT_LEVEL = 10
TALENT_ORDER = ("auto", "skill", "burst")

ASCENSION_PHASE_COSTS: dict[int, dict[str, Any]] = {
    1: {"stones": {"sliver": 1}, "boss": 0, "specialty": 3, "mob_drops": {"low": 3}},
    2: {"stones": {"fragment": 3}, "boss": 2, "specialty": 10, "mob_drops": {"low": 15}},
    3: {"stones": {"fragment": 6}, "boss": 4, "specialty": 20, "mob_drops": {"mid": 12}},
    4: {"stones": {"chunk": 3}, "boss": 8, "specialty": 30, "mob_drops": {"mid": 18}},
    5: {"stones": {"chunk": 6}, "boss": 12, "specialty": 45, "mob_drops": {"high": 12}},
    6: {"stones": {"gemstone": 6}, "boss": 20, "specialty": 60, "mob_drops": {"high": 24}},
}

TALENT_LEVEL_COSTS: dict[int, dict[str, Any]] = {
    2: {"books": {"low": 3}, "mob_drops": {"low": 6}, "weekly_boss": 0, "crown": 0},
    3: {"books": {"mid": 2}, "mob_drops": {"mid": 3}, "weekly_boss": 0, "crown": 0},
    4: {"books": {"mid": 4}, "mob_drops": {"mid": 4}, "weekly_boss": 0, "crown": 0},
    5: {"books": {"mid": 6}, "mob_drops": {"mid": 6}, "weekly_boss": 0, "crown": 0},
    6: {"books": {"mid": 9}, "mob_drops": {"mid": 9}, "weekly_boss": 0, "crown": 0},
    7: {"books": {"high": 4}, "mob_drops": {"high": 4}, "weekly_boss": 1, "crown": 0},
    8: {"books": {"high": 6}, "mob_drops": {"high": 6}, "weekly_boss": 1, "crown": 0},
    9: {"books": {"high": 12}, "mob_drops": {"high": 9}, "weekly_boss": 2, "crown": 0},
    10: {"books": {"high": 16}, "mob_drops": {"high": 12}, "weekly_boss": 2, "crown": 1},
}

TIER_ORDER_BY_GROUP = {
    "ascension.stones": ("sliver", "fragment", "chunk", "gemstone"),
    "mob_drops": ("low", "mid", "high"),
    "talents.books": ("low", "mid", "high"),
}


def calculate_character_requirements(
    character_name: str,
    *,
    target_talents: list[int] | None = None,
    calculate_talents: bool = True,
    include_ascension: bool = True,
    character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR,
    inventory_path: Path = DEFAULT_INVENTORY_PATH,
    dictionary_path: Path = DEFAULT_DICTIONARY_PATH,
) -> dict[str, Any]:
    """Return missing resources for a character goal as a strict JSON object."""

    resolved_character_id = resolve_character_id(character_name, character_kb_dir, dictionary_path)
    if not resolved_character_id:
        return {
            "error": f"Персонаж '{character_name}' не найден в базе. Попроси пользователя уточнить имя.",
            "character_name": character_name,
        }

    character_path = character_kb_dir / f"{resolved_character_id}.json"
    try:
        character = load_character(resolved_character_id, character_kb_dir)
    except FileNotFoundError:
        return {
            "error": f"Персонаж '{character_name}' распознан как '{resolved_character_id}', но файл базы не найден. Попроси пользователя уточнить имя.",
            "character_name": character_name,
            "resolved_character_id": resolved_character_id,
            "knowledge_path": str(character_path),
        }

    target_talents = normalize_target_talents(target_talents)
    resolved_inventory_path = resolve_inventory_path(inventory_path)
    inventory = load_inventory(resolved_inventory_path)
    inventory_counts = build_inventory_material_index(inventory)
    dictionary = load_translation_dictionary(dictionary_path)
    current_state = get_character_state(inventory, resolved_character_id)
    requirements = build_character_requirements(
        character,
        target_talents,
        calculate_talents,
        include_ascension,
        current_state,
    )
    result_items = build_result_items(requirements, inventory_counts, dictionary)
    enrich_with_material_info(result_items)

    return {
        "tool": "calculator.calculate_character_requirements",
        "запрошенное_имя": character_name,
        "персонаж_id": character["id"],
        "персонаж": character["name"],
        "текущее_состояние": current_state,
        "цель": {
            "возвышение_до_90": include_ascension,
            "считать_таланты": calculate_talents,
            "таланты_цель": {
                "auto": target_talents[0],
                "skill": target_talents[1],
                "burst": target_talents[2],
            },
        },
        "алхимия_учтена": True,
        "inventory_path": str(resolved_inventory_path) if resolved_inventory_path else None,
        "dictionary_path": str(dictionary_path) if dictionary_path.exists() else None,
        "knowledge_path": str(character_path),
        "результат_расчета": result_items,
    }


def calculate_characters_requirements(
    character_names: list[str],
    *,
    target_talents: list[int] | None = None,
    calculate_talents: bool = True,
    include_ascension: bool = True,
    character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR,
    inventory_path: Path = DEFAULT_INVENTORY_PATH,
    dictionary_path: Path = DEFAULT_DICTIONARY_PATH,
) -> dict[str, Any]:
    """Return batch resource calculations keyed by resolved character id."""

    results: dict[str, Any] = {}
    for character_name in character_names:
        name = str(character_name).strip()
        if not name:
            continue

        result = calculate_character_requirements(
            name,
            target_talents=target_talents,
            calculate_talents=calculate_talents,
            include_ascension=include_ascension,
            character_kb_dir=character_kb_dir,
            inventory_path=inventory_path,
            dictionary_path=dictionary_path,
        )

        if "error" in result:
            results[name] = result
            continue

        character_id = str(result.get("персонаж_id") or result.get("character_id") or name)
        results[character_id] = result.get("результат_расчета", [])

    return results


def load_character(character_id: str, character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR) -> dict[str, Any]:
    path = character_kb_dir / f"{normalize_id(character_id)}.json"
    if not path.exists():
        raise FileNotFoundError(f"Character KB JSON not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Character KB is not a JSON object: {path}")
    return data


def resolve_inventory_path(path: Path = DEFAULT_INVENTORY_PATH) -> Path | None:
    candidates = []
    if path:
        candidates.append(path)
    candidates.extend([ROOT_INVENTORY_PATH, RAW_INVENTORY_PATH])
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if candidate.exists():
            return candidate
    return None


def load_inventory(path: Path | None = DEFAULT_INVENTORY_PATH) -> dict[str, Any]:
    if path is None or not path.exists():
        print(
            "WARNING: inventory.json not found in project root or data/raw; assuming empty inventory.",
            file=sys.stderr,
        )
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Inventory GOOD file is not a JSON object: {path}")
    return data


def load_translation_dictionary(path: Path = DEFAULT_DICTIONARY_PATH) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items() if key and value}


def resolve_character_id(
    user_input_name: str,
    character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR,
    dictionary_path: Path = DEFAULT_DICTIONARY_PATH,
) -> str | None:
    query = normalize_human_name(user_input_name)
    if not query:
        return None

    reverse_dict: dict[str, str] = {}
    dictionary = load_translation_dictionary(dictionary_path)
    for key, value in dictionary.items():
        key_id = normalize_id(key)
        value_id = normalize_id(value)
        if (character_kb_dir / f"{key_id}.json").exists():
            reverse_dict[normalize_human_name(value)] = key_id
        if (character_kb_dir / f"{value_id}.json").exists():
            reverse_dict[normalize_human_name(key)] = value_id

    reverse_dict.update(
        {normalize_human_name(alias): normalize_id(character_id) for alias, character_id in CHARACTER_ALIASES_RU.items()}
    )
    reverse_dict.update(load_character_name_index(character_kb_dir))

    direct_id = normalize_id(user_input_name)
    direct_path = character_kb_dir / f"{direct_id}.json"
    if direct_path.exists():
        return direct_id

    if query in reverse_dict:
        resolved = reverse_dict[query]
        if (character_kb_dir / f"{resolved}.json").exists():
            return resolved

    matches = difflib.get_close_matches(query, reverse_dict.keys(), n=1, cutoff=0.6)
    if matches:
        resolved = reverse_dict[matches[0]]
        if (character_kb_dir / f"{resolved}.json").exists():
            return resolved

    kb_ids = [path.stem for path in character_kb_dir.glob("*.json")]
    id_matches = difflib.get_close_matches(direct_id, kb_ids, n=1, cutoff=0.6)
    if id_matches:
        return id_matches[0]

    return None


def load_character_name_index(character_kb_dir: Path = DEFAULT_CHARACTER_KB_DIR) -> dict[str, str]:
    index: dict[str, str] = {}
    if not character_kb_dir.exists():
        return index

    for path in character_kb_dir.glob("*.json"):
        character_id = normalize_id(path.stem)
        index[normalize_human_name(path.stem)] = character_id
        index[normalize_human_name(path.stem.replace("-", " "))] = character_id

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue

        name = data.get("name")
        if name:
            index[normalize_human_name(str(name))] = character_id

    return index


def translate_term(value: str, dictionary: Mapping[str, str]) -> str:
    return dictionary.get(value, value)


def normalize_target_talents(target_talents: list[int] | None) -> list[int]:
    if target_talents is None:
        return [TARGET_TALENT_LEVEL, TARGET_TALENT_LEVEL, TARGET_TALENT_LEVEL]

    normalized: list[int] = []
    for value in target_talents[: len(TALENT_ORDER)]:
        try:
            level = int(value)
        except (TypeError, ValueError):
            level = 1
        normalized.append(max(1, min(TARGET_TALENT_LEVEL, level)))

    while len(normalized) < len(TALENT_ORDER):
        normalized.append(1)

    return normalized


def build_character_requirements(
    character: Mapping[str, Any],
    target_talents: list[int],
    calculate_talents: bool,
    include_ascension: bool,
    current_state: Mapping[str, Any],
) -> list[dict[str, Any]]:
    materials = character.get("materials", {})
    requirements: list[dict[str, Any]] = []

    if include_ascension:
        ascension = materials.get("ascension", {})
        special = list(ascension.get("special", []))
        for phase in range(int(current_state.get("ascension", 0)) + 1, TARGET_ASCENSION + 1):
            phase_cost = ASCENSION_PHASE_COSTS.get(phase, {})
            requirements.extend(
                build_tiered_requirements(
                    group="ascension.stones",
                    category="ascension.stones",
                    names=ascension.get("stones", []),
                    costs=phase_cost.get("stones", {}),
                    order=TIER_ORDER_BY_GROUP["ascension.stones"],
                )
            )
            requirements.extend(
                build_tiered_requirements(
                    group="mob_drops",
                    category="ascension.mob_drops",
                    names=ascension.get("mob_drops", []),
                    costs=phase_cost.get("mob_drops", {}),
                    order=TIER_ORDER_BY_GROUP["mob_drops"],
                )
            )
            if special:
                requirements.append(
                    {
                        "category": "ascension.specialty",
                        "group": "",
                        "tier": "",
                        "name": special[0],
                        "required": int(phase_cost.get("specialty", 0)),
                    }
                )
            if len(special) >= 2:
                requirements.append(
                    {
                        "category": "ascension.world_boss",
                        "group": "",
                        "tier": "",
                        "name": special[1],
                        "required": int(phase_cost.get("boss", 0)),
                    }
                )

    if not calculate_talents:
        return requirements

    talents = materials.get("talents", {})
    current_talents = current_state.get("talents", {})
    weekly = list(talents.get("weekly_boss", []))
    crown = talents.get("crown")
    for index, talent_name in enumerate(TALENT_ORDER):
        current_level = int(current_talents.get(talent_name, 1))
        target_level = target_talents[index]
        if target_level <= current_level:
            continue
        for level in range(current_level + 1, target_level + 1):
            level_cost = TALENT_LEVEL_COSTS.get(level, {})
            requirements.extend(
                build_tiered_requirements(
                    group="talents.books",
                    category="talents.books",
                    names=talents.get("books", []),
                    costs=level_cost.get("books", {}),
                    order=TIER_ORDER_BY_GROUP["talents.books"],
                )
            )
            requirements.extend(
                build_tiered_requirements(
                    group="mob_drops",
                    category="talents.mob_drops",
                    names=talents.get("mob_drops", []),
                    costs=level_cost.get("mob_drops", {}),
                    order=TIER_ORDER_BY_GROUP["mob_drops"],
                )
            )
            if weekly and int(level_cost.get("weekly_boss", 0)):
                requirements.append(
                    {
                        "category": "talents.weekly_boss",
                        "group": "",
                        "tier": "",
                        "name": weekly[0],
                        "required": int(level_cost.get("weekly_boss", 0)),
                    }
                )
            if crown and int(level_cost.get("crown", 0)):
                requirements.append(
                    {
                        "category": "talents.crown",
                        "group": "",
                        "tier": "",
                        "name": crown,
                        "required": int(level_cost.get("crown", 0)),
                    }
                )

    return requirements


def build_tiered_requirements(
    *,
    group: str,
    category: str,
    names: list[str],
    costs: Mapping[str, Any],
    order: tuple[str, ...],
) -> list[dict[str, Any]]:
    requirements: list[dict[str, Any]] = []
    for index, cost_key in enumerate(order):
        if index >= len(names):
            continue
        requirements.append(
                {
                    "category": f"{category}.{cost_key}",
                    "group": group,
                    "tier": cost_key,
                    "name": names[index],
                    "required": int(costs.get(cost_key, 0)),
                }
        )
    return requirements


def get_character_state(inventory: Mapping[str, Any], character_id: str) -> dict[str, Any]:
    target = normalize_lookup_key(character_id)
    for character in inventory.get("characters", []) or []:
        if not isinstance(character, dict):
            continue
        key = str(character.get("key", ""))
        if normalize_lookup_key(key) != target:
            continue
        talents = character.get("talent", {}) if isinstance(character.get("talent"), dict) else {}
        return {
            "found_in_inventory": True,
            "ascension": int(character.get("ascension", 0) or 0),
            "level": int(character.get("level", 1) or 1),
            "talents": {
                "auto": int(talents.get("auto", 1) or 1),
                "skill": int(talents.get("skill", 1) or 1),
                "burst": int(talents.get("burst", 1) or 1),
            },
        }
    return {
        "found_in_inventory": False,
        "ascension": 0,
        "level": 1,
        "talents": {"auto": 1, "skill": 1, "burst": 1},
    }


def build_result_items(
    requirements: list[dict[str, Any]],
    inventory_counts: Mapping[str, int],
    dictionary: Mapping[str, str],
) -> list[dict[str, Any]]:
    aggregated = aggregate_requirements(requirements)
    alchemy_missing = calculate_alchemy_missing(aggregated, inventory_counts)

    result_items: list[dict[str, Any]] = []
    for key, item in aggregated.items():
        source_name = str(item["name"])
        owned = lookup_owned_count(source_name, inventory_counts)
        required = int(item["required"])
        if required <= 0:
            continue
        missing = alchemy_missing.get(key, max(required - owned, 0))
        result_items.append(
            {
                "source_name": source_name,
                "предмет": translate_term(source_name, dictionary),
                "категория": category_label(str(item["category"])),
                "нужно_всего": required,
                "есть_в_инвентаре": owned,
                "осталось_дофармить": missing,
            }
        )
    return result_items


def enrich_with_material_info(
    results: list[dict[str, Any]],
    material_kb_dir: Path = DEFAULT_MATERIAL_KB_DIR,
) -> list[dict[str, Any]]:
    """Attach farm days and source hints from knowledge_base/materials/*.json."""

    if not material_kb_dir.exists():
        return results

    for item in results:
        missing = int(item.get("осталось_дофармить", 0) or 0)
        if missing <= 0:
            continue

        source_name = str(item.get("source_name", "")).strip()
        if not source_name:
            continue

        material_path = material_kb_dir / f"{slugify_material_name(source_name)}.json"
        if not material_path.exists():
            continue

        try:
            data = json.loads(material_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue

        material_type = str(data.get("type", ""))
        days = data.get("days", [])
        source = data.get("source", [])
        normalized_days = [str(day) for day in days if day] if isinstance(days, list) else []
        normalized_source = [str(entry) for entry in source if entry] if isinstance(source, list) else []

        collection_mode = classify_collection_mode(material_type, normalized_source, normalized_days)
        if collection_mode:
            item["режим_сбора"] = collection_mode

        if should_include_farm_days(material_type, normalized_days):
            item["дни_фарма"] = normalized_days
        elif collection_mode:
            item["дни_фарма"] = None

        if normalized_source:
            item["где_найти"] = normalized_source

    return results


def should_include_farm_days(material_type: str, days: list[str]) -> bool:
    if not days:
        return False
    normalized_type = material_type.casefold()
    return "talent" in normalized_type or "weapon" in normalized_type


def classify_collection_mode(material_type: str, source: list[str], days: list[str]) -> str | None:
    normalized_type = material_type.casefold()
    normalized_source = " ".join(source).casefold()
    compact_source = re.sub(r"\s+", "", normalized_source)

    if ("talent" in normalized_type or "weapon" in normalized_type) and days:
        return None

    if "local specialty" in normalized_type:
        return "Ежедневно в открытом мире"

    is_character_material = (
        "character ascension material" in normalized_type
        or "character level-up material" in normalized_type
        or "character level up material" in normalized_type
    )
    if is_character_material:
        if (
            "normal boss" in normalized_source
            or "droppedbylv.30" in compact_source
            or "droppedbylv.30+" in compact_source
        ):
            return "Ежедневно (возрождается сразу после сбора награды)"
        if "weekly boss" in normalized_source or "trounce domain" in normalized_source:
            return "1 раз в неделю"

    if "weekly boss" in normalized_source or "trounce domain" in normalized_source:
        return "1 раз в неделю"
    if "normal boss" in normalized_source:
        return "Ежедневно (возрождается сразу после сбора награды)"

    return None


def slugify_material_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def aggregate_requirements(requirements: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    aggregated: dict[str, dict[str, Any]] = {}
    for requirement in requirements:
        key = requirement_key(requirement)
        item = aggregated.setdefault(
            key,
            {
                "category": requirement.get("category", ""),
                "group": requirement.get("group", ""),
                "tier": requirement.get("tier", ""),
                "name": requirement.get("name", ""),
                "required": 0,
            },
        )
        item["required"] += int(requirement.get("required", 0))
    return aggregated


def requirement_key(requirement: Mapping[str, Any]) -> str:
    return "|".join(
        [
            str(requirement.get("group", "")),
            str(requirement.get("tier", "")),
            normalize_lookup_key(str(requirement.get("name", ""))),
        ]
    )


def calculate_alchemy_missing(
    aggregated: Mapping[str, Mapping[str, Any]],
    inventory_counts: Mapping[str, int],
) -> dict[str, int]:
    missing: dict[str, int] = {}
    for key, item in aggregated.items():
        if not item.get("group"):
            owned = lookup_owned_count(str(item["name"]), inventory_counts)
            missing[key] = max(int(item["required"]) - owned, 0)

    for group, tier_order in TIER_ORDER_BY_GROUP.items():
        missing.update(apply_alchemy(aggregated, inventory_counts, group, tier_order))
    return missing


def apply_alchemy(
    aggregated: Mapping[str, Mapping[str, Any]],
    inventory_counts: Mapping[str, int],
    group: str,
    tier_order: tuple[str, ...],
) -> dict[str, int]:
    """Calculate tiered missing amounts with reserved lower-tier requirements.

    Bottom-up algorithm:
    difference = inventory_current_tier + crafted_bonus_from_previous_tier - required_current_tier.
    Positive difference becomes craftable bonus for the next tier via // 3.
    Negative difference is a real deficit and stops crafting into the next tier.
    """

    group_items = {
        str(item.get("tier")): (key, item)
        for key, item in aggregated.items()
        if item.get("group") == group
    }
    result: dict[str, int] = {}
    crafted_bonus = 0

    for tier in tier_order:
        if tier not in group_items:
            crafted_bonus = 0
            continue

        key, item = group_items[tier]
        required = int(item.get("required", 0))
        inventory_current_tier = lookup_owned_count(str(item["name"]), inventory_counts)
        difference = inventory_current_tier + crafted_bonus - required

        if difference >= 0:
            result[key] = 0
            crafted_bonus = difference // 3
        else:
            result[key] = abs(difference)
            crafted_bonus = 0

    return result


def build_inventory_material_index(inventory: Mapping[str, Any]) -> dict[str, int]:
    index: dict[str, int] = {}
    inv_materials = inventory.get("materials", {})
    if isinstance(inv_materials, dict):
        for key, value in inv_materials.items():
            count = int(value) if isinstance(value, int) or str(value).isdigit() else 0
            normalized = normalize_lookup_key(str(key))
            if normalized:
                index[normalized] = index.get(normalized, 0) + count
        return index

    if isinstance(inv_materials, list):
        for item in inv_materials:
            if not isinstance(item, dict):
                continue
            count = extract_count(item)
            for key in extract_inventory_names(item):
                normalized = normalize_lookup_key(key)
                if normalized:
                    index[normalized] = index.get(normalized, 0) + count

    for item in inventory.get("items", []) or []:
        if not isinstance(item, dict):
            continue
        count = extract_count(item)
        for key in extract_inventory_names(item):
            normalized = normalize_lookup_key(key)
            if normalized:
                index[normalized] = index.get(normalized, 0) + count
    return index


def extract_inventory_names(item: Mapping[str, Any]) -> list[str]:
    names: list[str] = []
    for field in ("key", "name", "id"):
        value = item.get(field)
        if value is not None:
            names.append(str(value))
    return names


def extract_count(item: Mapping[str, Any]) -> int:
    for field in ("count", "quantity", "amount", "number"):
        value = item.get(field)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 1


def lookup_owned_count(material_name: str, inventory_counts: Mapping[str, int]) -> int:
    candidates = {
        normalize_lookup_key(material_name),
        normalize_lookup_key(material_name.replace(" ", "")),
    }
    for candidate in candidates:
        if candidate in inventory_counts:
            return inventory_counts[candidate]
    return 0


def category_label(category: str) -> str:
    if ".stones." in category:
        return "Камни"
    if ".books." in category:
        return "Книги талантов"
    if ".mob_drops." in category:
        return "Материалы с мобов"
    if category == "talents.weekly_boss":
        return "Еженедельный босс"
    if category == "talents.crown":
        return "Корона прозрения"
    if category.startswith("ascension."):
        return "Особые материалы"
    return category


def normalize_id(value: str) -> str:
    return value.strip().casefold().replace("_", "-").replace(" ", "-")


def normalize_human_name(value: str) -> str:
    normalized = value.casefold().replace("ё", "е").replace("_", " ").replace("-", " ")
    normalized = re.sub(r"[^a-zа-я0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalize_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calculate missing character resources without LLM calls.")
    parser.add_argument(
        "character_names",
        nargs="+",
        help="Character names or ids, e.g. рейзор шеврез, or \"рейзор, шеврез\".",
    )
    parser.add_argument(
        "--target-talents",
        default="10,10,10",
        help="Target talent levels as auto,skill,burst, e.g. 1,9,8.",
    )
    parser.add_argument(
        "--talents",
        type=int,
        help="Legacy shortcut: how many first talents to level to 10.",
    )
    parser.add_argument("--no-ascension", action="store_true", help="Skip ascension-to-90 requirements.")
    parser.add_argument("--no-talents", action="store_true", help="Skip talent requirements.")
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY_PATH, help="Raw GOOD inventory JSON.")
    parser.add_argument("--dictionary", type=Path, default=DEFAULT_DICTIONARY_PATH, help="Translation dictionary JSON.")
    parser.add_argument("--kb-dir", type=Path, default=DEFAULT_CHARACTER_KB_DIR, help="Character KB JSON directory.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target_talents = parse_target_talents_arg(args.target_talents)
    if args.talents is not None:
        talent_count = max(0, min(int(args.talents), len(TALENT_ORDER)))
        target_talents = [TARGET_TALENT_LEVEL if index < talent_count else 1 for index in range(len(TALENT_ORDER))]
    result = calculate_characters_requirements(
        parse_character_names_arg(args.character_names),
        target_talents=target_talents,
        calculate_talents=not args.no_talents,
        include_ascension=not args.no_ascension,
        character_kb_dir=args.kb_dir,
        inventory_path=args.inventory,
        dictionary_path=args.dictionary,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def parse_target_talents_arg(value: str) -> list[int]:
    levels: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            levels.append(int(part))
        except ValueError:
            levels.append(1)
    return normalize_target_talents(levels)


def parse_character_names_arg(values: list[str]) -> list[str]:
    names: list[str] = []
    for value in values:
        for part in value.split(","):
            name = part.strip()
            if name:
                names.append(name)
    return names


if __name__ == "__main__":
    raise SystemExit(main())
