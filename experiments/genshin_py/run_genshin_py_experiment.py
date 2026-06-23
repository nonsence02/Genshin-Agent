from __future__ import annotations

import argparse
import asyncio
import inspect
import json
import os
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from .coverage_report import comparison_verdict, detect_coverage
    from .sanitize_output import sanitize_output
except ImportError:  # pragma: no cover - allows direct script execution
    from coverage_report import comparison_verdict, detect_coverage
    from sanitize_output import sanitize_output


DEFAULT_OUT = "data/raw/genshin_py/latest.sanitized.json"


def load_env() -> tuple[dict[str, str], list[str]]:
    loaded: list[str] = []
    if load_dotenv:
        for file_name in (".env.local", ".env"):
            path = Path(file_name)
            if path.exists():
                load_dotenv(path, override=False)
                loaded.append(file_name)
    return dict(os.environ), loaded


def parse_cookie_string(cookie: str | None) -> dict[str, str]:
    result: dict[str, str] = {}
    if not cookie:
        return result
    for part in cookie.split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key:
            result[key] = value
    return result


def build_config(env: dict[str, str], env_files_loaded: list[str], uid_override: str | None = None, lang: str = "en") -> dict[str, Any]:
    full_cookie = env.get("HOYOAPI_COOKIE", "").strip()
    parsed_cookie = parse_cookie_string(full_cookie)
    uid = uid_override or env.get("HOYOAPI_UID") or env.get("GENSHIN_UID")
    uid_source = "cli" if uid_override else "HOYOAPI_UID" if env.get("HOYOAPI_UID") else "GENSHIN_UID" if env.get("GENSHIN_UID") else "missing"
    ltuid_v2 = env.get("HOYOAPI_LTUID_V2") or env.get("LTUID_V2") or parsed_cookie.get("ltuid_v2")
    ltoken_v2 = env.get("HOYOAPI_LTOKEN_V2") or env.get("LTOKEN_V2") or parsed_cookie.get("ltoken_v2")
    cookie_token_v2 = env.get("HOYOAPI_COOKIE_TOKEN_V2") or env.get("COOKIE_TOKEN_V2") or parsed_cookie.get("cookie_token_v2")
    cookies = dict(parsed_cookie)
    if ltuid_v2:
        cookies.setdefault("ltuid_v2", ltuid_v2)
    if ltoken_v2:
        cookies.setdefault("ltoken_v2", ltoken_v2)
    if cookie_token_v2:
        cookies.setdefault("cookie_token_v2", cookie_token_v2)

    return {
        "uid": int(uid) if uid and str(uid).isdigit() else None,
        "uid_source": uid_source,
        "lang": lang,
        "cookies": cookies,
        "full_cookie_parsed": bool(parsed_cookie),
        "ltuid_v2_present": bool(ltuid_v2),
        "ltoken_v2_present": bool(ltoken_v2),
        "cookie_token_v2_present": bool(cookie_token_v2),
        "env_files_loaded": env_files_loaded,
    }


def config_diagnostic(config: dict[str, Any]) -> dict[str, Any]:
    return {
        "uid_present": bool(config["uid"]),
        "uid_source": config["uid_source"],
        "ltuid_v2_present": config["ltuid_v2_present"],
        "ltoken_v2_present": config["ltoken_v2_present"],
        "cookie_token_v2_present": config["cookie_token_v2_present"],
        "full_cookie_parsed": config["full_cookie_parsed"],
        "env_files_loaded": config["env_files_loaded"],
    }


async def maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def call_endpoint(name: str, callback) -> dict[str, Any]:
    try:
        data = await maybe_await(callback())
        return {"status": "ok", "data": data, "count": count_items(data)}
    except Exception as error:  # noqa: BLE001 - experiment should keep going
        return {"status": "error", "error": f"{name}: {error}", "count": 0}


def count_items(value: Any) -> int:
    if isinstance(value, (list, tuple, set)):
        return len(value)
    return 0


async def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    import genshin

    env, loaded = load_env()
    config = build_config(env, loaded, args.uid, args.lang)
    client = genshin.Client(config["cookies"], uid=config["uid"], lang=_normalize_lang(config["lang"]))
    endpoints: dict[str, dict[str, Any]] = {}
    selected_characters: list[Any] = []

    endpoints["game_accounts"] = await call_endpoint("get_game_accounts", lambda: client.get_game_accounts())
    endpoints["calculator_characters"] = await call_endpoint(
        "get_calculator_characters",
        lambda: client.get_calculator_characters(uid=config["uid"], lang=_normalize_lang(config["lang"]), sync=True),
    )
    endpoints["calculator_weapons"] = await call_endpoint(
        "get_calculator_weapons",
        lambda: client.get_calculator_weapons(lang=_normalize_lang(config["lang"])),
    )
    endpoints["calculator_artifacts"] = await call_endpoint(
        "get_calculator_artifacts",
        lambda: client.get_calculator_artifacts(lang=_normalize_lang(config["lang"])),
    )

    characters = list(endpoints["calculator_characters"].get("data") or []) if endpoints["calculator_characters"]["status"] == "ok" else []
    if args.details and characters:
        selected_characters = choose_characters(characters, args.limit_characters)
        details = []
        for character in selected_characters:
            details.append(await call_endpoint("get_character_details", lambda character=character: client.get_character_details(character, uid=config["uid"], lang=_normalize_lang(config["lang"]))))
        ok_details = [item.get("data") for item in details if item.get("status") == "ok"]
        endpoints["character_details"] = {
            "status": "ok" if ok_details else "error",
            "data": ok_details,
            "count": len(ok_details),
            "errors": [item.get("error") for item in details if item.get("status") == "error"],
        }
    else:
        endpoints["character_details"] = {"status": "skipped", "count": 0}

    if args.daily_notes:
        endpoints["daily_notes"] = await call_endpoint(
            "get_genshin_notes",
            lambda: client.get_genshin_notes(config["uid"], lang=_normalize_lang(config["lang"]), return_raw_data=True),
        )
    else:
        endpoints["daily_notes"] = {"status": "skipped", "count": 0}

    coverage = detect_coverage([endpoint.get("data") for endpoint in endpoints.values() if endpoint.get("status") == "ok"])
    statuses = {name: endpoint["status"] for name, endpoint in endpoints.items()}

    return {
        "config": config_diagnostic(config),
        "endpoints": endpoints,
        "selected_character_count": len(selected_characters),
        "coverage": coverage.to_dict(),
        "coverage_verdict": comparison_verdict(statuses, coverage),
        "comparison": {
            "hoyolab_profile": "level, constellation, talent levels, weapon summary, weak artifact info",
            "inventory_kamera": "materials, weapons, artifacts/items depending on file, no live HoYoLAB data",
            "hoyoapi": "auth failed for game record endpoints in this repository spike",
        },
    }


def choose_characters(characters: list[Any], limit: int) -> list[Any]:
    preferred_names = ("skirk", "furina")
    by_name = []
    rest = []
    for character in characters:
        name = str(getattr(character, "name", "") or getattr(character, "id", "")).lower()
        if any(preferred in name for preferred in preferred_names):
            by_name.append(character)
        else:
            rest.append(character)
    selected = [*by_name, *rest]
    return selected[: max(0, limit)]


def _normalize_lang(lang: str) -> str:
    if lang == "en":
        return "en-us"
    return lang


def write_output(path: str | None, value: Any, no_write: bool) -> dict[str, Any]:
    if not path:
        return {"written": False, "path": None, "reason": "--out was not provided"}
    resolved = Path(path).resolve()
    if no_write:
        return {"written": False, "path": str(resolved), "reason": "--no-write"}
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(sanitize_output(value), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"written": True, "path": str(resolved)}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Experimental genshin.py calculator coverage probe")
    parser.add_argument("--print-config", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out")
    parser.add_argument("--lang", default="en")
    parser.add_argument("--uid")
    parser.add_argument("--limit-characters", type=int, default=5)
    parser.add_argument("--details", action="store_true")
    parser.add_argument("--daily-notes", action="store_true")
    parser.add_argument("--no-write", action="store_true")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    env, loaded = load_env()
    config = build_config(env, loaded, args.uid, args.lang)

    if args.print_config:
        print(json.dumps(config_diagnostic(config), indent=2))
        return

    result = await run_experiment(args)
    write_result = write_output(args.out, result, args.no_write)
    result["sanitized_output"] = write_result

    if args.json:
        print(json.dumps(sanitize_output(result), indent=2, ensure_ascii=False))
        return

    print_summary(result)


def print_summary(result: dict[str, Any]) -> None:
    endpoints = result["endpoints"]
    coverage = result["coverage"]
    print("genshin.py experiment summary")
    print(f"calculator characters endpoint: {endpoints['calculator_characters']['status']}")
    print(f"calculator characters count: {endpoints['calculator_characters'].get('count', 0)}")
    print(f"calculator weapons endpoint: {endpoints['calculator_weapons']['status']}")
    print(f"calculator weapons count: {endpoints['calculator_weapons'].get('count', 0)}")
    print(f"calculator artifacts endpoint: {endpoints['calculator_artifacts']['status']}")
    print(f"calculator artifacts count: {endpoints['calculator_artifacts'].get('count', 0)}")
    print(f"character details endpoint: {endpoints['character_details']['status']}")
    print(f"character details tested count: {endpoints['character_details'].get('count', 0)}")
    print(f"daily notes endpoint: {endpoints['daily_notes']['status']}")
    print(f"coverage verdict: {result['coverage_verdict']}")
    print(f"sanitized output written: {result['sanitized_output']['written']}")
    print(f"sanitized output path: {result['sanitized_output']['path']}")
    print("character field coverage:")
    for key, value in coverage.items():
        print(f"  {key}: {'yes' if value else 'no'}")


if __name__ == "__main__":
    asyncio.run(main())
