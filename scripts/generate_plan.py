"""Run the full local Genshin planner pipeline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from genshin_planner.inventory import InventoryMarkdownWriter, InventoryParser  # noqa: E402
from genshin_planner.llm import OllamaClient, PlannerAgent  # noqa: E402
from genshin_planner.retrieval import ContextBuilder, GoalParser  # noqa: E402


DEFAULT_MANUAL_OVERRIDES = {
    "characters": [
        {
            "key": "Traveler",
            "level": 90,
            "ascension": 6,
            "constellation": 6,
            "talent": {"auto": 1, "skill": 1, "burst": 1},
        }
    ]
}


def main() -> int:
    args = _parse_args()

    inventory = InventoryParser(manual_overrides=DEFAULT_MANUAL_OVERRIDES).parse_directory(
        args.inventory_dir
    )
    inventory_markdown = InventoryMarkdownWriter().render(inventory)
    args.inventory_output.parent.mkdir(parents=True, exist_ok=True)
    args.inventory_output.write_text(inventory_markdown, encoding="utf-8")

    goals_text = _read_goals(args.goals)
    entity_keys = GoalParser().parse_text(goals_text)
    context_prompt = ContextBuilder().build_prompt(
        inventory_markdown=inventory_markdown,
        goals_text=goals_text,
        entity_keys=entity_keys,
    )

    agent = PlannerAgent(
        client=OllamaClient(
            model=args.model,
            num_ctx=args.num_ctx,
            temperature=args.temperature,
        )
    )
    plan = agent.generate_plan(context_prompt)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(plan, encoding="utf-8")

    print(f"Inventory markdown written: {args.inventory_output}")
    print(f"Goals parsed: {', '.join(entity_keys) if entity_keys else 'no known entities found'}")
    print(f"Plan written: {args.output}")
    return 0


def _read_goals(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(
            f"Goals file not found: {path}. Create it with free-form goals, for example: "
            "Прокачать Варку и Нахиду."
        )
    return path.read_text(encoding="utf-8")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a Genshin farming plan with Ollama.")
    parser.add_argument(
        "--inventory-dir",
        type=Path,
        default=PROJECT_ROOT / "data" / "raw",
        help="Directory containing GOOD .json inventory exports.",
    )
    parser.add_argument(
        "--goals",
        type=Path,
        default=PROJECT_ROOT / "data" / "processed" / "goals.txt",
        help="Free-form player goals text file.",
    )
    parser.add_argument(
        "--inventory-output",
        type=Path,
        default=PROJECT_ROOT / "data" / "processed" / "inventory.md",
        help="Path where the compact inventory markdown snapshot is saved.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "data" / "output" / "plan.md",
        help="Path where the generated plan markdown is saved.",
    )
    parser.add_argument(
        "--model",
        default="qwen2.5:7b-instruct-q4_K_M",
        help="Ollama model name.",
    )
    parser.add_argument(
        "--num-ctx",
        type=int,
        default=8192,
        help="Ollama context window size.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="Ollama generation temperature.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
