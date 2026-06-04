"""Parse raw GOOD inventory exports into a compact markdown summary."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from genshin_planner.inventory import InventoryMarkdownWriter, InventoryParser  # noqa: E402


DEFAULT_MANUAL_OVERRIDES = {
    "characters": [
        {
            "key": "nonsense",
            "level": 90,
            "ascension": 6,
            "constellation": 6,
            "talent": {"auto": 1, "skill": 9, "burst": 9},
        }
    ]
}


def main() -> int:
    args = _parse_args()
    parser = InventoryParser(manual_overrides=DEFAULT_MANUAL_OVERRIDES)
    inventory = parser.parse_directory(args.input_dir)

    output_path = InventoryMarkdownWriter().write(inventory, args.output)
    print(f"Inventory markdown written: {output_path}")
    print(
        "Parsed "
        f"{len(inventory.characters)} characters, "
        f"{len(inventory.weapons)} weapons, "
        f"{len(inventory.materials)} materials "
        f"from {len(inventory.source_files)} GOOD file(s)."
    )
    return 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse GOOD JSON exports from data/raw into inventory.md."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "raw",
        help="Directory containing one or more GOOD .json files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "processed" / "inventory.md",
        help="Markdown output path.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
