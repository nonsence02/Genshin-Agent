"""Split HoYoLAB and Inventory Kamera imports into processed account files."""

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

CHARACTERS_OUTPUT = PROCESSED_DIR / "characters.json"
ARTIFACTS_OUTPUT = PROCESSED_DIR / "artifacts.json"
WEAPONS_OUTPUT = PROCESSED_DIR / "weapons.json"
MATERIALS_OUTPUT = PROCESSED_DIR / "materials.json"

CHARACTERS_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
ARTIFACTS_DIR = PROJECT_ROOT / "knowledge_base" / "artifacts"
MATERIALS_DIR = PROJECT_ROOT / "knowledge_base" / "materials"


def main() -> int:
    RAW_IMPORTS_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    context = ResolverContext()
    hoyolab_profile = load_optional_json(RAW_IMPORTS_DIR / "hoyolab_profile.json")
    good_payload = load_optional_json(RAW_IMPORTS_DIR / "good.json")
    weapons_payload = load_optional_json(RAW_IMPORTS_DIR / "weapons.json")

    characters = load_hoyolab_characters(hoyolab_profile, context)
    artifacts = load_kamera_artifacts(good_payload, context)
    weapons = load_kamera_weapons(good_payload, weapons_payload, context)
    materials = load_kamera_materials(good_payload, context)

    attach_equipped_artifacts(characters, artifacts, context)

    write_json(CHARACTERS_OUTPUT, characters)
    write_json(ARTIFACTS_OUTPUT, artifacts)
    write_json(WEAPONS_OUTPUT, weapons)
    write_json(MATERIALS_OUTPUT, materials)

    print(f"Characters saved: {CHARACTERS_OUTPUT} ({len(characters)})")
    print(f"Artifacts saved: {ARTIFACTS_OUTPUT} ({len(artifacts)})")
    print(f"Weapons saved: {WEAPONS_OUTPUT} ({len(weapons)})")
    print(f"Materials saved: {MATERIALS_OUTPUT} ({len(materials)})")
    return 0


class ResolverContext:
    def __init__(self) -> None:
        self.weapons_db = load_weapons_db()
        self.character_index = build_entity_index(CHARACTERS_DIR)
        self.material_index = build_entity_index(MATERIALS_DIR)

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


def load_hoyolab_characters(profile: Any, context: ResolverContext) -> dict[str, Any]:
    raw_characters = profile.get("characters", {}) if isinstance(profile, dict) else {}
    if not isinstance(raw_characters, dict):
        return {}

    characters: dict[str, Any] = {}
    for source_id, raw_character in raw_characters.items():
        if not isinstance(raw_character, dict):
            continue

        character_id_source = raw_character.get("id") or source_id
        if character_id_source == "unknown":
            character_id_source = raw_character.get("name_ru") or raw_character.get("name_en") or source_id

        character_id = context.resolve_character(character_id_source)
        if not character_id:
            continue

        character = dict(raw_character)
        character["id"] = character_id
        character["equipped_artifacts"] = []

        weapon = character.get("equipped_weapon")
        if isinstance(weapon, dict):
            character["equipped_weapon"] = normalize_hoyolab_weapon(weapon, context)

        characters[character_id] = character
    return characters


def load_kamera_artifacts(good_payload: Any, context: ResolverContext) -> list[dict[str, Any]]:
    artifacts = extract_list_section(good_payload, "artifacts")
    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_artifact in artifacts:
        if not isinstance(raw_artifact, dict):
            continue
        artifact = normalize_good_artifact(raw_artifact, context)
        fingerprint = unique_fingerprint(raw_artifact, "artifact")
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        normalized.append(artifact)
    return normalized


def load_kamera_weapons(good_payload: Any, weapons_payload: Any, context: ResolverContext) -> list[dict[str, Any]]:
    raw_weapons = [
        *extract_list_section(good_payload, "weapons"),
        *extract_list_section(weapons_payload, "weapons"),
    ]

    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw_weapon in raw_weapons:
        if not isinstance(raw_weapon, dict):
            continue
        fingerprint = unique_fingerprint(raw_weapon, "weapon")
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        normalized.append(normalize_good_weapon(raw_weapon, context))
    return normalized


def load_kamera_materials(good_payload: Any, context: ResolverContext) -> list[dict[str, Any]]:
    raw_materials = extract_materials(good_payload)
    normalized: list[dict[str, Any]] = []
    for key, count in raw_materials.items():
        material_id = context.resolve_material(key)
        if not material_id:
            continue
        normalized.append(
            {
                "id": material_id,
                "source_key": str(key),
                "count": safe_int(count),
            }
        )
    return normalized


def attach_equipped_artifacts(characters: dict[str, Any], artifacts: list[dict[str, Any]], context: ResolverContext) -> None:
    for character in characters.values():
        if isinstance(character, dict):
            character["equipped_artifacts"] = []

    for artifact in artifacts:
        location = str(artifact.get("location") or "").strip()
        if not location:
            continue

        character_id = context.resolve_character(location)
        if character_id not in characters:
            continue
        characters[character_id].setdefault("equipped_artifacts", []).append(artifact)


def normalize_hoyolab_weapon(raw_weapon: dict[str, Any], context: ResolverContext) -> dict[str, Any]:
    name = raw_weapon.get("name") or raw_weapon.get("name_ru") or raw_weapon.get("name_en")
    return {
        **raw_weapon,
        "id": context.resolve_weapon(name),
    }


def normalize_good_weapon(raw_weapon: dict[str, Any], context: ResolverContext) -> dict[str, Any]:
    location = str(raw_weapon.get("location") or "").strip()
    return {
        "id": context.resolve_weapon(raw_weapon.get("key")),
        "source_key": raw_weapon.get("key"),
        "level": raw_weapon.get("level"),
        "ascension": raw_weapon.get("ascension"),
        "refinement": raw_weapon.get("refinement"),
        "location": context.resolve_character(location) if location else "",
        "lock": bool(raw_weapon.get("lock", False)),
        "source": "kamera",
    }


def normalize_good_artifact(raw_artifact: dict[str, Any], context: ResolverContext) -> dict[str, Any]:
    location = str(raw_artifact.get("location") or "").strip()
    return {
        "set_id": context.resolve_artifact_set(raw_artifact.get("setKey")),
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


def extract_list_section(payload: Any, section: str) -> list[Any]:
    if not payload:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        value = payload.get(section)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            return list(value.values())
        if looks_like_single_entity(payload, section):
            return [payload]
    return []


def looks_like_single_entity(payload: dict[str, Any], section: str) -> bool:
    if section == "weapons":
        return "key" in payload and "refinement" in payload
    if section == "artifacts":
        return "setKey" in payload and "slotKey" in payload
    return False


def extract_materials(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    materials = payload.get("materials", {})
    if isinstance(materials, dict):
        return dict(materials)
    if isinstance(materials, list):
        result: dict[str, Any] = {}
        for item in materials:
            if not isinstance(item, dict):
                continue
            key = item.get("key") or item.get("name")
            if key:
                result[str(key)] = item.get("count", 0)
        return result
    return {}


def unique_fingerprint(raw_item: dict[str, Any], kind: str) -> str:
    for key in ("uid", "uuid", "instanceId", "instance_id"):
        value = raw_item.get(key)
        if value not in (None, "", 0, "0"):
            return f"{kind}:uid:{value}"

    item_id = raw_item.get("id")
    if item_id not in (None, "", 0, "0"):
        return f"{kind}:id:{item_id}"

    return kind + ":" + json.dumps(raw_item, ensure_ascii=False, sort_keys=True)


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


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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
