"""Generate or update the manual character builds mapping template."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "character_builds.json"
DEFAULT_BUILD_TEMPLATE = {
    "signatures": [],
    "stats": [],
    "passive_keywords": [],
}


def main() -> int:
    args = parse_args()
    builds = load_builds(args.output)

    added = 0
    for path in sorted(args.lore_dir.glob("*.json")):
        character_id = path.stem
        if character_id not in builds:
            builds[character_id] = new_build_template()
            added += 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(builds, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {args.output}. Added {added} character id(s). Total: {len(builds)}.")
    return 0


def load_builds(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Character builds file must contain a JSON object: {path}")

    return {str(key): value for key, value in data.items()}


def new_build_template() -> dict[str, list[str]]:
    return {key: list(value) for key, value in DEFAULT_BUILD_TEMPLATE.items()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate data/character_builds.json from character lore files.")
    parser.add_argument("--lore-dir", type=Path, default=DEFAULT_LORE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
