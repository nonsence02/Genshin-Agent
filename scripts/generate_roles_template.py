"""Generate or update the manual character role mapping template."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LORE_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "manual_roles.json"


def main() -> int:
    args = parse_args()
    roles = load_roles(args.output)

    added = 0
    for path in sorted(args.lore_dir.glob("*.json")):
        char_id = path.stem
        if char_id not in roles:
            roles[char_id] = []
            added += 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(roles, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {args.output}. Added {added} character id(s). Total: {len(roles)}.")
    return 0


def load_roles(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}

    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Manual roles file must contain a JSON object: {path}")

    roles: dict[str, list[str]] = {}
    for key, value in data.items():
        if isinstance(value, list):
            roles[str(key)] = [str(item) for item in value]
        else:
            roles[str(key)] = []
    return roles


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate data/manual_roles.json from character lore files.")
    parser.add_argument("--lore-dir", type=Path, default=DEFAULT_LORE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
