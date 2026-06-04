"""Markdown writer for compact LLM-readable inventory summaries."""

from __future__ import annotations

from pathlib import Path

from .parser import Inventory, Material


BASIC_RESOURCE_NAMES: dict[str, str] = {
    "Mora": "Мора",
    "Primogem": "Камни Истока",
    "Primogems": "Камни Истока",
    "FragileResin": "Слабая смола",
    "TransientResin": "Переходная смола",
    "CondensedResin": "Густая смола",
    "OriginalResin": "Первородная смола",
    "IntertwinedFate": "Переплетающиеся судьбы",
    "AcquaintFate": "Судьбоносные встречи",
}


class InventoryMarkdownWriter:
    """Serialize parsed inventory into a compact markdown file."""

    def write(self, inventory: Inventory, output_path: str | Path) -> Path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.render(inventory), encoding="utf-8")
        return path

    def render(self, inventory: Inventory) -> str:
        materials_by_key = {material.key: material for material in inventory.materials}
        lines: list[str] = []

        lines.extend(self._render_basic_resources(materials_by_key))
        lines.append("")
        lines.extend(self._render_characters(inventory))
        lines.append("")
        lines.extend(self._render_weapons(inventory))
        lines.append("")
        lines.extend(self._render_important_materials(inventory))
        lines.append("")

        return "\n".join(lines)

    def _render_basic_resources(self, materials_by_key: dict[str, Material]) -> list[str]:
        lines = ["# 💎 Базовые ресурсы"]

        emitted = False
        for key, display_name in BASIC_RESOURCE_NAMES.items():
            material = materials_by_key.get(key)
            if material is None:
                continue
            lines.append(f"- {display_name}: {_format_count(material.count)}")
            emitted = True

        if not emitted:
            lines.append("- Нет данных")

        return lines

    def _render_characters(self, inventory: Inventory) -> list[str]:
        lines = ["# 👥 Персонажи"]
        characters = sorted(
            inventory.characters,
            key=lambda item: (-item.level, -item.ascension, item.key),
        )

        if not characters:
            lines.append("- Нет данных")
            return lines

        for character in characters:
            talent = character.talent
            lines.append(
                f"- {character.key} "
                f"(Ур. {character.level}, C{character.constellation}, "
                f"Таланты: {talent.auto}/{talent.skill}/{talent.burst})"
            )

        return lines

    def _render_weapons(self, inventory: Inventory) -> list[str]:
        lines = ["# ⚔️ Оружие"]
        weapons = sorted(
            inventory.weapons,
            key=lambda item: (
                -item.level,
                -item.ascension,
                -item.refinement,
                item.key,
                item.location,
            ),
        )

        if not weapons:
            lines.append("- Нет данных")
            return lines

        for weapon in weapons:
            location = f", на: {weapon.location}" if weapon.location else ""
            lines.append(
                f"- {weapon.key} "
                f"(Ур. {weapon.level}, R{weapon.refinement}{location})"
            )

        return lines

    def _render_important_materials(self, inventory: Inventory) -> list[str]:
        lines = ["# 🎒 Важные материалы"]
        important_materials = [
            material
            for material in inventory.materials
            if material.key not in BASIC_RESOURCE_NAMES
        ]
        important_materials.sort(key=lambda item: item.key)

        if not important_materials:
            lines.append("- Нет данных")
            return lines

        for material in important_materials:
            lines.append(f"- {material.key}: {_format_count(material.count)}")

        return lines


def _format_count(value: int) -> str:
    return f"{value:,}".replace(",", " ")
