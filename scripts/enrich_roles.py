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
ALLOWED_TAGS = (
    "Main DPS",
    "Sub DPS",
    "Хиллер",
    "Щитовик",
    "Саппорт/Баффер",
    "Аппликатор",
)

ROLE_PROMPT = (
    "Ты — строгий алгоритм-классификатор для базы данных Genshin Impact. "
    "Прочитай таланты и выбери от 1 до 3 тегов из РАЗРЕШЕННОГО СПИСКА. "
    "ПРАВИЛА ВЫБОРА (ТРИГГЕРЫ): "
    "- Хиллер: выбирай ТОЛЬКО если в талантах есть слова \"restores HP\", \"regenerates HP\", \"heals\". "
    "- Щитовик: выбирай ТОЛЬКО если есть слова \"shield\", \"absorbs DMG\". "
    "- Саппорт/Баффер: выбирай ТОЛЬКО если таланты увеличивают статы союзников (\"increases ATK\", \"Elemental Mastery\", \"Bonus DMG\"). "
    "- Sub DPS (Карманный урон): выбирай, если навык или ульта оставляют на поле объект, который бьет врагов, пока персонаж не на поле (\"coordinated attack\", \"deals DMG over time\"). "
    "- Аппликатор: выбирай, если персонаж накладывает элементальный статус из кармана (постоянный элементальный урон по площади вокруг активного героя). "
    "- Main DPS: выбирай ТОЛЬКО если персонаж должен долго находиться на поле, его обычные атаки получают инфузию (Infusion), или урон зависит от стаков, которые он копит сам. "
    "РАЗРЕШЕННЫЙ СПИСОК: [Main DPS, Sub DPS, Хиллер, Щитовик, Саппорт/Баффер, Аппликатор]. "
    "ВЫВЕДИ ТОЛЬКО ТЕГИ ЧЕРЕЗ ЗАПЯТУЮ. БОЛЬШЕ НИЧЕГО."
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

        talents_text = build_talents_text(data)
        if not talents_text:
            print(f"[{index}/{len(paths)}] {path.name}: skipped, no talent text")
            skipped += 1
            continue

        print(f"[{index}/{len(paths)}] {path.stem}: generating role tags...")
        try:
            tags = request_role_tags(client, args.model, talents_text)
        except Exception as exc:  # noqa: BLE001 - local LLM batch should continue after a timeout.
            print(f"  ERROR: LLM request failed: {exc}")
            continue
        data["ai_tags"] = clean_tags(tags)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        processed += 1
        print(f"  ai_tags: {data['ai_tags']}")

        if args.sleep > 0 and index < len(paths):
            time.sleep(args.sleep)

    print(f"Done. Processed: {processed}. Skipped: {skipped}.")
    return 0


def build_talents_text(data: dict[str, Any]) -> str:
    talents = data.get("talents", [])
    if isinstance(talents, list):
        chunks = []
        for talent in talents:
            if not isinstance(talent, dict):
                continue
            talent_type = str(talent.get("type", "") or "").strip()
            name = str(talent.get("name", "") or "").strip()
            description = str(talent.get("description", "") or "").strip()
            if not description:
                continue
            chunks.append(f"[Тип: {talent_type}] Название: {name}\nОписание: {description}")
        return "\n\n".join(chunks)

    return build_legacy_combat_talents_text(data.get("combat_talents", {}))


def build_legacy_combat_talents_text(combat_talents: Any) -> str:
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
        temperature=0.0,
        timeout=30.0,
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
    selected: list[str] = []
    for part in text.strip("`'\" .,").split(","):
        tag = normalize_tag(part)
        if tag and tag in ALLOWED_TAGS and tag not in selected:
            selected.append(tag)
        if len(selected) == 3:
            break
    return ", ".join(selected)


def normalize_tag(value: str) -> str:
    text = " ".join(str(value or "").strip("`'\" .").split())
    aliases = {
        "Sub-DPS": "Sub DPS",
        "Sub dps": "Sub DPS",
        "Sub DPS / Карманный урон": "Sub DPS",
        "Main dps": "Main DPS",
        "Элементальный аппликатор": "Аппликатор",
        "Баффер": "Саппорт/Баффер",
        "Саппорт": "Саппорт/Баффер",
        "Enabler": "Саппорт/Баффер",
    }
    return aliases.get(text, text)


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
