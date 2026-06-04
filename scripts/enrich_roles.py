"""Generate concise AI role tags for scraped character lore files."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.orchestrator import DEFAULT_API_KEY, DEFAULT_BASE_URL, DEFAULT_MODEL  # noqa: E402


DEFAULT_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"

ROLE_PROMPT = (
    "Ты — киберспортивный аналитик Genshin Impact. "
    "Прочитай описание навыков персонажа и определи его роль в отряде. "
    "Верни СТРОГО одну короткую строку с 2-3 тегами через запятую "
    "(например: 'Main DPS, Карманный урон', 'Хиллер, Баффер', 'Щитовик, Саппорт'). "
    "НИКАКОГО дополнительного текста, приветствий или форматирования. Только теги."
)


def main() -> int:
    args = parse_args()
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install `openai` first: pip install openai") from exc

    lore_dir = args.lore_dir
    if not lore_dir.exists():
        raise FileNotFoundError(f"Character lore directory not found: {lore_dir}")

    paths = sorted(lore_dir.glob("*.json"))
    if args.limit > 0:
        paths = paths[: args.limit]

    client = OpenAI(base_url=args.base_url, api_key=args.api_key)
    processed = 0
    skipped = 0

    print(f"Loaded {len(paths)} character lore file(s).")
    for index, path in enumerate(paths, start=1):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[{index}/{len(paths)}] {path.name}: ERROR reading JSON: {exc}")
            continue

        if not isinstance(data, dict):
            print(f"[{index}/{len(paths)}] {path.name}: skipped, root is not an object")
            skipped += 1
            continue

        if "ai_tags" in data and not args.force:
            print(f"[{index}/{len(paths)}] {path.name}: skipped, ai_tags already exists")
            skipped += 1
            continue

        talents_text = build_combat_talents_text(data.get("combat_talents", {}))
        if not talents_text:
            print(f"[{index}/{len(paths)}] {path.name}: skipped, no combat talent text")
            skipped += 1
            continue

        print(f"[{index}/{len(paths)}] {path.stem}: generating role tags...")
        tags = request_role_tags(client, args.model, talents_text)
        data["ai_tags"] = clean_tags(tags)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        processed += 1
        print(f"  ai_tags: {data['ai_tags']}")

        if args.sleep > 0 and index < len(paths):
            time.sleep(args.sleep)

    print(f"Done. Processed: {processed}. Skipped: {skipped}.")
    return 0


def build_combat_talents_text(combat_talents: Any) -> str:
    if not isinstance(combat_talents, dict):
        return ""

    chunks: list[str] = []
    labels = {
        "normal_attack": "Обычная атака",
        "elemental_skill": "Элементальный навык",
        "elemental_burst": "Взрыв стихии",
    }
    for key, label in labels.items():
        value = str(combat_talents.get(key, "") or "").strip()
        if value:
            chunks.append(f"{label}: {value}")
    return "\n\n".join(chunks)


def request_role_tags(client: Any, model: str, talents_text: str) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": ROLE_PROMPT},
            {"role": "user", "content": f"Текст навыков:\n{talents_text}"},
        ],
        temperature=0.1,
    )
    return response.choices[0].message.content or ""


def clean_tags(value: str) -> str:
    text = str(value or "").strip()
    text = text.strip("`'\" \n\r\t")
    text = text.replace("\n", " ")
    if ":" in text and len(text.split(":", 1)[0]) < 40:
        text = text.split(":", 1)[1]
    text = text.replace("*", "").replace("-", " ")
    text = " ".join(text.split())
    return text.strip("`'\" .,")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate ai_tags for character lore JSON files.")
    parser.add_argument("--lore-dir", type=Path, default=DEFAULT_LORE_DIR)
    parser.add_argument("--limit", type=int, default=0, help="Maximum files to process; 0 means no limit.")
    parser.add_argument("--sleep", type=float, default=2.0, help="Pause between local LLM requests.")
    parser.add_argument("--force", action="store_true", help="Regenerate ai_tags even if the field already exists.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--api-key", default=DEFAULT_API_KEY)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
