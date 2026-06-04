"""Name/key resolver helpers for inventory scanner keys."""

from __future__ import annotations

import difflib
import re
from collections.abc import Iterable
from typing import Any


def resolve_weapon_key(inventory_key: str, weapons_db: dict[str, Any]) -> str:
    """Resolve an Inventory Kamera weapon key to a local weapon KB id."""

    normalized_key = normalize_weapon_name(inventory_key)
    if not normalized_key:
        print(f"[DEBUG] Резолв оружия: '{inventory_key}' -> ''")
        return ""

    normalized_to_id: dict[str, str] = {}
    for weapon_id, weapon in iter_weapons(weapons_db):
        name = str(weapon.get("name", "") if isinstance(weapon, dict) else "").strip()
        normalized_name = normalize_weapon_name(name)
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
