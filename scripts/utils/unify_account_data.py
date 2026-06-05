"""Merge HoYoLAB and Inventory Kamera imports into one account JSON."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.tools.calculator import resolve_character_id  # noqa: E402
from scripts.tools.weapon_info import load_weapons_db  # noqa: E402
from scripts.utils.name_resolver import normalize_weapon_name, resolve_artifact_key, resolve_weapon_key  # noqa: E402


RAW_IMPORTS_DIR = PROJECT_ROOT / "data" / "raw" / "user_imports"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_PATH = PROCESSED_DIR / "unified_account.json"

CHARACTERS_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
ARTIFACTS_DIR = PROJECT_ROOT / "knowledge_base" / "artifacts"
MATERIALS_DIR = PROJECT_ROOT / "knowledge_base" / "materials"


def main() -> int:
    RAW_IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    context = ResolverContext()
    unified = {
        "characters": {},
        "inventory": {
            "weapons": [],
            "artifacts": [],
            "materials": [],
        },
    }

    hoyolab_profile = load_optional_json(RAW_IMPORTS_DIR / "hoyolab_profile.json")
    good_payload = load_good_payload()

    merge_hoyolab_characters(unified, hoyolab_profile, context)
    merge_good_characters(unified, good_payload, context, only_if_missing=bool(hoyolab_profile))
    merge_kamera_artifacts(unified, good_payload, context)
    merge_kamera_weapons(unified, good_payload, context)
    merge_kamera_materials(unified, good_payload, context)

    OUTPUT_PATH.write_text(json.dumps(unified, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Unified account saved: {OUTPUT_PATH}")
    print(f"Characters: {len(unified['characters'])}")
    print(f"Weapons in inventory: {len(unified['inventory']['weapons'])}")
    print(f"Artifacts in inventory: {len(unified['inventory']['artifacts'])}")
    print(f"Materials in inventory: {len(unified['inventory']['materials'])}")
    return 0


class ResolverContext:
    def __init__(self) -> None:
        self.weapons_db = load_weapons_db()
        self.material_index = build_entity_index(MATERIALS_DIR)
        self.character_index = build_entity_index(CHARACTERS_DIR)

    def resolve_character(self, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""

        resolved = resolve_character_id(text)
        if resolved:
            return resolved

        normalized = normalize_entity_name(text)
        if normalized in self.character_index:
            return self.character_index[normalized]

        return slugify(text)

    def resolve_weapon(self, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        return resolve_weapon_key(text, self.weapons_db) or slugify(text)

    def resolve_artifact_set(self, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        return resolve_artifact_key(text, str(ARTIFACTS_DIR)) or slugify(text)

    def resolve_material(self, value: Any) -> str:
        text = str(value or "").strip()
        if not text:
            return ""
        normalized = normalize_entity_name(text)
        return self.material_index.get(normalized, slugify(text))


def merge_hoyolab_characters(unified: dict[str, Any], profile: dict[str, Any], context: ResolverContext) -> None:
    characters = profile.get("characters", {}) if isinstance(profile, dict) else {}
    if not isinstance(characters, dict):
        return

    for source_id, raw_character in characters.items():
        if not isinstance(raw_character, dict):
            continue
        character_id = raw_character.get("id") or source_id
        character_id = context.resolve_character(character_id if character_id != "unknown" else raw_character.get("name_ru", ""))
        if not character_id:
            continue

        character = ensure_character(unified, character_id)
        character.update(
            {
                "id": character_id,
                "name_ru": raw_character.get("name_ru", character.get("name_ru", "")),
                "level": raw_character.get("level", character.get("level")),
                "rarity": raw_character.get("rarity", character.get("rarity")),
                "constellation": raw_character.get("constellation", character.get("constellation")),
                "talents": raw_character.get("talents", character.get("talents", {})),
            }
        )

        weapon = normalize_hoyolab_weapon(raw_character.get("equipped_weapon"), context)
        if weapon:
            character["equipped_weapon"] = weapon

        character.setdefault("equipped_artifacts", [])


def merge_good_characters(
    unified: dict[str, Any],
    good_payload: dict[str, Any],
    context: ResolverContext,
    only_if_missing: bool,
) -> None:
    for raw_character in as_list(good_payload.get("characters", [])):
        if not isinstance(raw_character, dict):
            continue

        character_id = context.resolve_character(raw_character.get("key"))
        if not character_id:
            continue
        if only_if_missing and character_id in unified["characters"]:
            continue

        character = ensure_character(unified, character_id)
        character.update(
            {
                "id": character_id,
                "level": raw_character.get("level", character.get("level")),
                "constellation": raw_character.get("constellation", character.get("constellation")),
                "talents": normalize_good_talents(raw_character.get("talent")),
            }
        )


def merge_kamera_artifacts(unified: dict[str, Any], good_payload: dict[str, Any], context: ResolverContext) -> None:
    for raw_artifact in as_list(good_payload.get("artifacts", [])):
        if not isinstance(raw_artifact, dict):
            continue

        artifact = normalize_good_artifact(raw_artifact, context)
        unified["inventory"]["artifacts"].append(artifact)

        location = str(raw_artifact.get("location") or "").strip()
        if not location:
            continue

        character_id = context.resolve_character(location)
        if not character_id:
            continue
        character = ensure_character(unified, character_id)
        character.setdefault("equipped_artifacts", []).append(artifact)


def merge_kamera_weapons(unified: dict[str, Any], good_payload: dict[str, Any], context: ResolverContext) -> None:
    for raw_weapon in as_list(good_payload.get("weapons", [])):
        if not isinstance(raw_weapon, dict):
            continue

        weapon = normalize_good_weapon(raw_weapon, context)
        location = str(raw_weapon.get("location") or "").strip()
        if location:
            character_id = context.resolve_character(location)
            if character_id:
                character = ensure_character(unified, character_id)
                character.setdefault("equipped_weapon", weapon)
            continue

        unified["inventory"]["weapons"].append(weapon)


def merge_kamera_materials(unified: dict[str, Any], good_payload: dict[str, Any], context: ResolverContext) -> None:
    materials = good_payload.get("materials", {})
    if isinstance(materials, dict):
        iterable = materials.items()
    elif isinstance(materials, list):
        iterable = ((item.get("key") or item.get("name"), item.get("count", 0)) for item in materials if isinstance(item, dict))
    else:
        return

    for key, count in iterable:
        material_id = context.resolve_material(key)
        if not material_id:
            continue
        unified["inventory"]["materials"].append(
            {
                "id": material_id,
                "source_key": str(key),
                "count": safe_int(count),
            }
        )


def normalize_hoyolab_weapon(raw_weapon: Any, context: ResolverContext) -> dict[str, Any] | None:
    if not isinstance(raw_weapon, dict):
        return None
    name = raw_weapon.get("name") or raw_weapon.get("name_ru") or raw_weapon.get("name_en")
    weapon_id = context.resolve_weapon(name)
    return {
        "id": weapon_id,
        "name": name or "",
        "level": raw_weapon.get("level"),
        "refinement": raw_weapon.get("refinement"),
        "rarity": raw_weapon.get("rarity"),
        "source": "hoyolab",
    }


def normalize_good_weapon(raw_weapon: dict[str, Any], context: ResolverContext) -> dict[str, Any]:
    weapon_id = context.resolve_weapon(raw_weapon.get("key"))
    return {
        "id": weapon_id,
        "source_key": raw_weapon.get("key"),
        "level": raw_weapon.get("level"),
        "ascension": raw_weapon.get("ascension"),
        "refinement": raw_weapon.get("refinement"),
        "location": context.resolve_character(raw_weapon.get("location")) if raw_weapon.get("location") else "",
        "lock": bool(raw_weapon.get("lock", False)),
        "source": "kamera",
    }


def normalize_good_artifact(raw_artifact: dict[str, Any], context: ResolverContext) -> dict[str, Any]:
    set_id = context.resolve_artifact_set(raw_artifact.get("setKey"))
    location = str(raw_artifact.get("location") or "").strip()
    return {
        "set_id": set_id,
        "source_set_key": raw_artifact.get("setKey"),
        "slot": raw_artifact.get("slotKey") or raw_artifact.get("slot"),
        "rarity": raw_artifact.get("rarity"),
        "main_stat": raw_artifact.get("mainStatKey") or raw_artifact.get("mainStat"),
        "level": raw_artifact.get("level"),
        "substats": raw_artifact.get("substats", []),
        "unactivated_substats": raw_artifact.get("unactivatedSubstats", []),
        "location": context.resolve_character(location) if location else "",
        "lock": bool(raw_artifact.get("lock", False)),
        "source": "kamera",
    }


def normalize_good_talents(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {
        "normal_attack": value.get("auto"),
        "elemental_skill": value.get("skill"),
        "elemental_burst": value.get("burst"),
    }


def ensure_character(unified: dict[str, Any], character_id: str) -> dict[str, Any]:
    characters = unified["characters"]
    if character_id not in characters:
        characters[character_id] = {
            "id": character_id,
            "equipped_artifacts": [],
        }
    return characters[character_id]


def load_good_payload() -> dict[str, Any]:
    merged: dict[str, Any] = {
        "weapons": [],
        "artifacts": [],
        "materials": {},
        "characters": [],
    }

    for name in ("kamera_good.json", "good.json"):
        payload = load_optional_json(RAW_IMPORTS_DIR / name)
        merge_good_payload(merged, payload)

    merge_good_payload(merged, load_optional_json(RAW_IMPORTS_DIR / "kamera_weapons.json"), section_hint="weapons")
    merge_good_payload(merged, load_optional_json(RAW_IMPORTS_DIR / "kamera_artifacts.json"), section_hint="artifacts")
    merge_good_payload(merged, load_optional_json(RAW_IMPORTS_DIR / "kamera_materials.json"), section_hint="materials")
    return merged


def merge_good_payload(target: dict[str, Any], payload: Any, section_hint: str | None = None) -> None:
    if not payload:
        return

    if section_hint:
        section_value = extract_section(payload, section_hint)
        merge_section(target, section_hint, section_value)
        return

    if isinstance(payload, dict):
        for section in ("weapons", "artifacts", "characters", "materials"):
            merge_section(target, section, payload.get(section))


def extract_section(payload: Any, section: str) -> Any:
    if isinstance(payload, dict):
        if section in payload:
            return payload[section]
        return payload
    return payload


def merge_section(target: dict[str, Any], section: str, value: Any) -> None:
    if value is None:
        return

    if section == "materials":
        if isinstance(value, dict):
            for key, count in value.items():
                target["materials"][key] = count
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    key = item.get("key") or item.get("name")
                    if key:
                        target["materials"][key] = item.get("count", 0)
        return

    if isinstance(value, list):
        target[section].extend(value)
    elif isinstance(value, dict):
        target[section].extend(value.values())


def build_entity_index(directory: Path) -> dict[str, str]:
    index: dict[str, str] = {}
    if not directory.exists():
        return index

    for path in directory.glob("*.json"):
        data = load_optional_json(path)
        if not isinstance(data, dict):
            continue
        entity_id = str(data.get("id") or path.stem)
        for value in (
            entity_id,
            path.stem,
            data.get("name"),
            data.get("name_ru"),
            data.get("name_en"),
            data.get("key"),
        ):
            normalized = normalize_entity_name(value)
            if normalized:
                index[normalized] = entity_id
    return index


def load_optional_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Warning: could not read {path}: {exc}", file=sys.stderr)
        return {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def normalize_entity_name(value: Any) -> str:
    return normalize_weapon_name(str(value or ""))


def slugify(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parts = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z]|$)|\d+", raw)
    if len(parts) > 1 and "".join(parts).casefold() == raw.casefold():
        raw = " ".join(parts)
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", raw.strip().lower()).strip("-")
    return slug or normalize_entity_name(raw)


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
