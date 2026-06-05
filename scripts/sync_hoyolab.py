"""Sync live HoYoLAB profile data through genshin.py into local JSON."""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    import genshin
except ImportError as exc:  # pragma: no cover - dependency availability is environment-specific.
    genshin = None  # type: ignore[assignment]
    GENSHIN_IMPORT_ERROR = exc
else:
    GENSHIN_IMPORT_ERROR = None

try:
    from dotenv import load_dotenv
except ImportError as exc:  # pragma: no cover - dependency availability is environment-specific.
    load_dotenv = None  # type: ignore[assignment]
    DOTENV_IMPORT_ERROR = exc
else:
    DOTENV_IMPORT_ERROR = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "data" / "hoyolab_profile.json"
CHARACTERS_DIR = PROJECT_ROOT / "knowledge_base" / "characters"


async def main() -> int:
    if GENSHIN_IMPORT_ERROR is not None:
        print("Ошибка: установите библиотеку genshin: pip install genshin", file=sys.stderr)
        return 1
    if DOTENV_IMPORT_ERROR is not None or load_dotenv is None:
        print("Ошибка: установите python-dotenv: pip install python-dotenv", file=sys.stderr)
        return 1

    load_dotenv(PROJECT_ROOT / ".env")

    ltuid_v2 = os.getenv("LTUID_V2", "").strip()
    ltoken_v2 = os.getenv("LTOKEN_V2", "").strip()
    uid = os.getenv("GENSHIN_UID", "").strip()

    missing = [
        name
        for name, value in {
            "LTUID_V2": ltuid_v2,
            "LTOKEN_V2": ltoken_v2,
            "GENSHIN_UID": uid,
        }.items()
        if not value
    ]
    if missing:
        print(
            "Ошибка: в .env отсутствуют параметры: "
            + ", ".join(missing)
            + "\nДобавьте LTUID_V2, LTOKEN_V2 и GENSHIN_UID.",
            file=sys.stderr,
        )
        return 1

    client = genshin.Client(lang="ru-ru")
    set_client_cookies(client, ltuid_v2, ltoken_v2)

    try:
        print(f"[1/3] Запрашиваю профиль HoYoLAB для UID {uid}...")
        user = await client.get_genshin_user(int(uid))
        print("[2/3] Нормализую персонажей, оружие и артефакты...")
        payload = build_profile_payload(uid, user)
    except get_invalid_cookies_errors() as exc:
        print(
            "Ошибка авторизации HoYoLAB: cookies протухли или неверны. "
            f"Обновите LTUID_V2/LTOKEN_V2 в .env. Детали: {exc}",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:  # noqa: BLE001 - CLI should print friendly sync failures.
        print(f"Ошибка синхронизации HoYoLAB: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[3/3] Профиль сохранен: {OUTPUT_PATH}")
    print(f"Персонажей: {len(payload.get('characters', {}))}")
    return 0


def set_client_cookies(client: Any, ltuid_v2: str, ltoken_v2: str) -> None:
    cookies = {"ltuid_v2": ltuid_v2, "ltoken_v2": ltoken_v2}
    if hasattr(client, "set_cookies"):
        try:
            client.set_cookies(**cookies)
            return
        except TypeError:
            client.set_cookies(cookies)
            return

    if hasattr(client, "cookies") and hasattr(client.cookies, "update"):
        client.cookies.update(cookies)
        return

    raise RuntimeError("Не удалось передать cookies в genshin.Client: неизвестный API клиента.")


def get_invalid_cookies_errors() -> tuple[type[BaseException], ...]:
    errors = getattr(genshin, "errors", None)
    invalid = getattr(errors, "InvalidCookies", None)
    if isinstance(invalid, type) and issubclass(invalid, BaseException):
        return (invalid,)
    return tuple()


def build_profile_payload(uid: str, user: Any) -> dict[str, Any]:
    character_index = build_character_index()
    characters: dict[str, Any] = {}
    for raw_character in as_list(get_field(user, "characters", default=[])):
        normalized = normalize_character(raw_character, character_index)
        characters[normalized["id"]] = normalized

    return {
        "source": "hoyolab",
        "uid": uid,
        "nickname": get_field(user, "nickname", "name", "username", default=""),
        "level": get_field(user, "level", "adventure_rank", default=None),
        "characters": characters,
    }


def normalize_character(raw_character: Any, character_index: dict[str, str]) -> dict[str, Any]:
    data = to_plain(raw_character)
    name_ru = str(get_field(data, "name", "name_ru", default="")).strip()
    name_en = str(get_field(data, "name_en", "english_name", default="")).strip()
    character_id = resolve_local_character_id(name_ru, name_en, data, character_index)

    return {
        "id": character_id,
        "name_ru": name_ru,
        "level": safe_int(get_field(data, "level", default=0)),
        "rarity": safe_int(get_field(data, "rarity", "rank", default=0)),
        "constellation": extract_constellation(data),
        "talents": extract_talents(data),
        "equipped_weapon": extract_weapon(data),
        "equipped_artifacts": extract_artifacts(data),
    }


def build_character_index() -> dict[str, str]:
    index: dict[str, str] = {}
    if not CHARACTERS_DIR.exists():
        return index

    for path in CHARACTERS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue

        character_id = str(data.get("id") or path.stem)
        for value in (character_id, data.get("name_ru"), data.get("name_en")):
            key = normalize_lookup(value)
            if key:
                index[key] = character_id
    return index


def resolve_local_character_id(
    name_ru: str,
    name_en: str,
    data: dict[str, Any],
    character_index: dict[str, str],
) -> str:
    for value in (name_en, name_ru, get_field(data, "id", "key", "avatar_id", default="")):
        key = normalize_lookup(value)
        if key in character_index:
            return character_index[key]
    return slugify(name_en or name_ru or str(get_field(data, "id", "key", default="unknown")))


def extract_constellation(data: dict[str, Any]) -> int:
    for key in ("constellation", "constellations_unlocked", "actived_constellation_num", "actived_constellation"):
        value = get_field(data, key, default=None)
        if value is not None:
            return max(0, min(6, safe_int(value)))

    constellations = get_field(data, "constellations", default=[])
    if isinstance(constellations, list):
        return max(0, min(6, sum(1 for item in constellations if is_unlocked(item))))
    return 0


def extract_talents(data: dict[str, Any]) -> dict[str, int | None]:
    raw_talents = get_field(data, "talents", "skills", default=[])
    talents = as_list(raw_talents)
    levels: list[int] = []
    for talent in talents:
        plain = to_plain(talent)
        level = get_field(plain, "level", "base_level", "raw_level", "unlock_level", default=None)
        if level is not None:
            levels.append(safe_int(level))

    # genshin.py can expose only effective levels after constellations. We keep
    # these as reported by HoYoLAB so downstream tools know they are live values.
    return {
        "normal_attack": levels[0] if len(levels) > 0 else None,
        "elemental_skill": levels[1] if len(levels) > 1 else None,
        "elemental_burst": levels[2] if len(levels) > 2 else None,
    }


def extract_weapon(data: dict[str, Any]) -> dict[str, Any] | None:
    weapon = get_field(data, "weapon", "equipped_weapon", default=None)
    if weapon is None:
        return None

    plain = to_plain(weapon)
    return {
        "name": get_field(plain, "name", "name_ru", "name_en", default=""),
        "level": safe_int(get_field(plain, "level", default=0)),
        "refinement": safe_int(get_field(plain, "refinement", "refine", "rank", default=1)),
        "rarity": safe_int(get_field(plain, "rarity", default=0)),
    }


def extract_artifacts(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw_artifacts = get_field(data, "artifacts", "relics", default=[])
    artifacts: list[dict[str, Any]] = []
    for artifact in as_list(raw_artifacts):
        plain = to_plain(artifact)
        artifacts.append(
            {
                "set": get_field(plain, "set", "set_name", "setName", default=""),
                "slot": normalize_artifact_slot(get_field(plain, "slot", "pos", "type", default="")),
                "main_stat": extract_main_stat(plain),
                "level": safe_int(get_field(plain, "level", default=0)),
                "rarity": safe_int(get_field(plain, "rarity", default=0)),
            }
        )
    return artifacts


def extract_main_stat(artifact: dict[str, Any]) -> str:
    main_stat = get_field(artifact, "main_stat", "mainStat", "main_property", default=None)
    if main_stat is None:
        return ""
    plain = to_plain(main_stat)
    if isinstance(plain, dict):
        return str(get_field(plain, "name", "stat", "type", default=""))
    return str(plain)


def normalize_artifact_slot(value: Any) -> str:
    raw = str(value or "").casefold()
    compact = re.sub(r"[\W_]+", "", raw, flags=re.UNICODE)
    aliases = {
        "flower": "flower",
        "floweroflife": "flower",
        "equipbracer": "flower",
        "1": "flower",
        "plume": "plume",
        "feather": "plume",
        "plumeofdeath": "plume",
        "equipnecklace": "plume",
        "2": "plume",
        "sands": "sands",
        "sandsofeon": "sands",
        "equipshoes": "sands",
        "3": "sands",
        "goblet": "goblet",
        "gobletofeonothem": "goblet",
        "equipring": "goblet",
        "4": "goblet",
        "circlet": "circlet",
        "circletoflogos": "circlet",
        "equipdress": "circlet",
        "5": "circlet",
    }
    return aliases.get(compact, raw.strip())


def is_unlocked(value: Any) -> bool:
    plain = to_plain(value)
    if isinstance(plain, dict):
        return bool(get_field(plain, "unlocked", "is_unlocked", "activated", default=False))
    return bool(plain)


def get_field(source: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(source, dict) and name in source:
            return source[name]
        if hasattr(source, name):
            return getattr(source, name)
    return default


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def to_plain(value: Any) -> Any:
    if isinstance(value, dict):
        return value
    for method_name in ("model_dump", "dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return method()
            except TypeError:
                continue
    return value


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def normalize_lookup(value: Any) -> str:
    return re.sub(r"[\W_]+", "", str(value or "").casefold(), flags=re.UNICODE)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "unknown"


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
