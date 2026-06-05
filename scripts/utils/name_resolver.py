"""Name/key resolver helpers for inventory scanner keys."""

from __future__ import annotations

import difflib
import json
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROCESSED_CHARACTERS_PATH = PROJECT_ROOT / "data" / "processed" / "characters.json"
DEFAULT_CHARACTER_KB_DIR = PROJECT_ROOT / "knowledge_base" / "characters"

RU_TO_EN_MAP: dict[str, str] = {
    "сяо": "xiao",
    "ху тао": "hu-tao",
    "хутао": "hu-tao",
    "яэ мико": "yae-miko",
    "райдэн": "raiden-shogun",
    "рейден": "raiden-shogun",
    "сёгун райдэн": "raiden-shogun",
    "сегун райден": "raiden-shogun",
    "сара": "kujou-sara",
    "кудзё сара": "kujou-sara",
    "кудзе сара": "kujou-sara",
    "тарталья": "tartaglia",
    "чайльд": "tartaglia",
    "аяка": "kamisato-ayaka",
    "аято": "kamisato-ayato",
    "кадзуха": "kaedehara-kazuha",
    "кокоми": "sangonomiya-kokomi",
    "джинн": "jean",
    "джин": "jean",
    "юнь цзинь": "yun-jin",
    "юньцзинь": "yun-jin",
    "невиллет": "neuvillette",
    "невилет": "neuvillette",
    "арлекино": "arlecchino",
    "нефер": "sethos",
    "сетос": "sethos",
    "айно": "aino",
    "рейзор": "razor",
    "рэйзор": "razor",
    "ризли": "wriothesley",
    "вриотесли": "wriothesley",
    "риотесли": "wriothesley",
    "флинс": "flins",
    "шеврез": "chevreuse",
    "шеврёз": "chevreuse",
    "беннет": "bennett",
    "беннетт": "bennett",
    "сян лин": "xiangling",
    "сянлин": "xiangling",
    "син цю": "xingqiu",
    "синцю": "xingqiu",
    "сянь юнь": "xianyun",
    "сяньюнь": "xianyun",
    "чжун ли": "zhongli",
    "чжунли": "zhongli",
    "нахида": "nahida",
    "фурина": "furina",
    "эола": "eula",
    "эула": "eula",
    "гань юй": "ganyu",
    "ганьюй": "ganyu",
    "кэ цин": "keqing",
    "кэцин": "keqing",
    "ци ци": "qiqi",
    "цици": "qiqi",
    "кли": "klee",
    "мона": "mona",
    "барбара": "barbara",
    "ноэлль": "noelle",
    "ноэль": "noelle",
    "нин гуан": "ningguang",
    "нингуан": "ningguang",
    "фишль": "fischl",
    "сахароза": "sucrose",
    "венти": "venti",
    "альбедо": "albedo",
    "дилюк": "diluc",
    "кэйа": "kaeya",
    "кейа": "kaeya",
    "эмбер": "amber",
    "лиза": "lisa",
    "коллеи": "collei",
    "коллей": "collei",
    "мавуика": "mavuika",
    "скирк": "skirk",
    "лаума": "lauma",
    "варка": "varka",
}


def resolve_character_id(
    query: str,
    characters_file: str | Path = DEFAULT_PROCESSED_CHARACTERS_PATH,
    character_kb_dir: str | Path = DEFAULT_CHARACTER_KB_DIR,
    fuzzy_cutoff: float = 0.8,
) -> str | None:
    """Resolve a character query strictly, with hard aliases before fuzzy matching."""

    normalized_query = normalize_human_name(query)
    if not normalized_query:
        return None

    if normalized_query in RU_TO_EN_MAP:
        return RU_TO_EN_MAP[normalized_query]

    processed_ids = load_processed_character_ids(Path(characters_file))
    kb_ids = load_kb_character_ids(Path(character_kb_dir))
    known_ids = processed_ids | kb_ids

    direct_slug = slugify_character_query(query)
    if direct_slug in known_ids:
        return direct_slug

    lookup = build_character_lookup(Path(character_kb_dir), known_ids)
    if normalized_query in lookup:
        return lookup[normalized_query]

    matches = difflib.get_close_matches(normalized_query, lookup.keys(), n=1, cutoff=fuzzy_cutoff)
    if matches:
        return lookup[matches[0]]

    id_matches = difflib.get_close_matches(direct_slug, known_ids, n=1, cutoff=fuzzy_cutoff)
    if id_matches:
        return id_matches[0]

    return None


def load_processed_character_ids(path: Path) -> set[str]:
    data = load_json(path)
    if not isinstance(data, dict):
        return set()
    return {str(key) for key, value in data.items() if isinstance(value, dict)}


def load_kb_character_ids(directory: Path) -> set[str]:
    if not directory.exists():
        return set()
    return {path.stem for path in directory.glob("*.json")}


def build_character_lookup(character_kb_dir: Path, known_ids: set[str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for character_id in known_ids:
        lookup[normalize_human_name(character_id)] = character_id
        lookup[normalize_human_name(character_id.replace("-", " "))] = character_id

    if not character_kb_dir.exists():
        return lookup

    for path in character_kb_dir.glob("*.json"):
        data = load_json(path)
        if not isinstance(data, dict):
            continue
        character_id = str(data.get("id") or path.stem)
        for key in ("name", "name_ru", "name_en"):
            value = data.get(key)
            if value:
                lookup[normalize_human_name(str(value))] = character_id
    return lookup


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def normalize_human_name(value: Any) -> str:
    normalized = str(value or "").casefold().replace("ё", "е").replace("_", " ").replace("-", " ")
    normalized = re.sub(r"[^a-zа-я0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def slugify_character_query(value: Any) -> str:
    normalized = str(value or "").casefold().replace("_", "-").strip()
    normalized = re.sub(r"[^a-z0-9а-яё-]+", "-", normalized, flags=re.UNICODE)
    return re.sub(r"-+", "-", normalized).strip("-")


def resolve_weapon_key(inventory_key: str, weapons_db: dict[str, Any]) -> str:
    """Resolve an Inventory Kamera weapon key to a local weapon KB id."""

    normalized_key = normalize_weapon_name(inventory_key)
    if not normalized_key:
        print(f"[DEBUG] Резолв оружия: '{inventory_key}' -> ''")
        return ""

    normalized_to_id: dict[str, str] = {}
    for weapon_id, weapon in iter_weapons(weapons_db):
        if not isinstance(weapon, dict):
            continue
        names = [
            weapon_id,
            weapon.get("name"),
            weapon.get("name_en"),
            weapon.get("name_ru"),
        ]
        for name in names:
            normalized_name = normalize_weapon_name(str(name or "").strip())
            if normalized_name:
                normalized_to_id[normalized_name] = weapon_id

    if normalized_key in normalized_to_id:
        weapon_id = normalized_to_id[normalized_key]
        print(f"[DEBUG] Резолв оружия: '{inventory_key}' -> '{weapon_id}'")
        return weapon_id

    matches = difflib.get_close_matches(normalized_key, normalized_to_id.keys(), n=1, cutoff=0.82)
    if matches:
        weapon_id = normalized_to_id[matches[0]]
        print(f"[DEBUG] Резолв оружия: '{inventory_key}' -> '{weapon_id}'")
        return weapon_id

    print(f"[DEBUG] Резолв оружия: '{inventory_key}' -> ''")
    return ""


def iter_weapons(weapons_db: dict[str, Any]) -> Iterable[tuple[str, dict[str, Any]]]:
    """Yield ``(weapon_id, weapon_data)`` pairs from common weapon DB shapes."""

    source: Any = weapons_db.get("weapons", weapons_db) if isinstance(weapons_db, dict) else weapons_db
    if isinstance(source, dict):
        for key, value in source.items():
            if not isinstance(value, dict):
                continue
            weapon_id = str(value.get("id") or key)
            yield weapon_id, value
        return

    if isinstance(source, list):
        for value in source:
            if not isinstance(value, dict):
                continue
            weapon_id = str(value.get("id") or "")
            if weapon_id:
                yield weapon_id, value


def normalize_weapon_name(value: str) -> str:
    """Lowercase and remove spaces, apostrophes, hyphens and punctuation."""

    return re.sub(r"[\W_]+", "", str(value or "").casefold(), flags=re.UNICODE)


def resolve_artifact_key(query: str, artifacts_dir: str = "knowledge_base/artifacts") -> str:
    """Resolve an artifact set query to a local artifact KB id."""

    normalized_query = normalize_weapon_name(query)
    if not normalized_query:
        print(f"[DEBUG] Резолв артефакта: '{query}' -> ''")
        return ""

    normalized_to_id: dict[str, str] = {}
    base_dir = Path(artifacts_dir)
    if not base_dir.is_absolute():
        base_dir = Path.cwd() / base_dir

    if not base_dir.exists():
        print(f"[DEBUG] Резолв артефакта: '{query}' -> ''")
        return ""

    for path in base_dir.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue

        artifact_id = str(data.get("id") or path.stem)
        names = [
            artifact_id,
            data.get("name"),
            data.get("name_en"),
            data.get("name_ru"),
        ]
        for name in names:
            normalized_name = normalize_weapon_name(str(name or "").strip())
            if normalized_name:
                normalized_to_id[normalized_name] = artifact_id

    if normalized_query in normalized_to_id:
        artifact_id = normalized_to_id[normalized_query]
        print(f"[DEBUG] Резолв артефакта: '{query}' -> '{artifact_id}'")
        return artifact_id

    matches = difflib.get_close_matches(normalized_query, normalized_to_id.keys(), n=1, cutoff=0.78)
    if matches:
        artifact_id = normalized_to_id[matches[0]]
        print(f"[DEBUG] Резолв артефакта: '{query}' -> '{artifact_id}'")
        return artifact_id

    print(f"[DEBUG] Резолв артефакта: '{query}' -> ''")
    return ""
