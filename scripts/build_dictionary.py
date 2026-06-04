"""Build Russian -> English character name mappings from local lore JSON files."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.orchestrator import DEFAULT_API_KEY, DEFAULT_BASE_URL, DEFAULT_MODEL  # noqa: E402


DEFAULT_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"
DEFAULT_DICTIONARY_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"


def main() -> int:
    args = parse_args()
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install `openai` first: pip install openai") from exc

    dictionary = load_dictionary(args.dictionary)
    existing_english = {normalize_name(value) for value in dictionary.values()}
    client = OpenAI(base_url=args.base_url, api_key=args.api_key)

    candidates = load_lore_names(args.lore_dir)
    if args.limit > 0:
        candidates = candidates[: args.limit]

    added = 0
    print(f"Loaded {len(candidates)} character lore name(s). Dictionary: {args.dictionary}")
    for index, name_en in enumerate(candidates, start=1):
        if normalize_name(name_en) in existing_english:
            print(f"[{index}/{len(candidates)}] SKIP: {name_en}")
            continue

        print(f"[{index}/{len(candidates)}] Translating: {name_en}")
        try:
            name_ru = translate_character_name(client, args.model, name_en)
        except Exception as exc:  # noqa: BLE001 - batch generation should continue.
            print(f"  ERROR: {exc}")
            continue

        if not name_ru:
            print("  ERROR: empty translation")
            continue

        dictionary[name_ru] = name_en
        existing_english.add(normalize_name(name_en))
        save_dictionary(args.dictionary, dictionary)
        added += 1
        print(f"  OK: {name_ru} -> {name_en}")

        if args.sleep > 0 and index < len(candidates):
            time.sleep(args.sleep)

    print(f"Done. Added {added} name(s). Total entries: {len(dictionary)}.")
    return 0


def load_dictionary(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items() if key and value}


def save_dictionary(path: Path, dictionary: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = dict(sorted(dictionary.items(), key=lambda item: item[0].casefold()))
    path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_lore_names(lore_dir: Path) -> list[str]:
    names: list[str] = []
    for path in sorted(lore_dir.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict):
            continue
        name_en = str(data.get("name_en") or "").strip()
        if name_en and name_en not in names:
            names.append(name_en)
    return names


def translate_character_name(client: Any, model: str, name_en: str) -> str:
    prompt = (
        f"Переведи имя персонажа Genshin Impact на русский язык: {name_en}. "
        "В ответе напиши ТОЛЬКО имя на русском, без кавычек и точек."
    )
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        timeout=15.0,
    )
    return clean_translation(response.choices[0].message.content or "")


def clean_translation(value: str) -> str:
    text = str(value or "").strip().strip("`'\" .")
    text = re.sub(r"\s+", " ", text)
    return text.strip("`'\" .")


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Russian -> English character dictionary from lore JSON files.")
    parser.add_argument("--lore-dir", type=Path, default=DEFAULT_LORE_DIR)
    parser.add_argument("--dictionary", type=Path, default=DEFAULT_DICTIONARY_PATH)
    parser.add_argument("--limit", type=int, default=0, help="Maximum names to process; 0 means no limit.")
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--api-key", default=DEFAULT_API_KEY)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
