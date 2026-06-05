"""Artifact set lookup tool for the modular Genshin-Agent knowledge base."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.tools.calculator import PROJECT_ROOT
from scripts.utils.name_resolver import resolve_artifact_key


DEFAULT_ARTIFACTS_DIR = PROJECT_ROOT / "knowledge_base" / "artifacts"


def get_artifact_set_details(set_name: str) -> str:
    """Return artifact set details as a compact human-readable text block."""

    artifact_id = resolve_artifact_key(set_name, str(DEFAULT_ARTIFACTS_DIR))
    if not artifact_id:
        return f"Сет артефактов '{set_name}' не найден в базе."

    artifact = load_artifact_record(artifact_id)
    if not artifact:
        return f"Сет артефактов '{set_name}' не найден в базе."

    return "\n".join(
        [
            f"Сет артефактов: {artifact.get('name_ru') or artifact.get('name_en') or artifact_id}",
            f"Name EN: {artifact.get('name_en') or 'Не найдено'}",
            f"ID: {artifact.get('id', artifact_id)}",
            f"Макс. редкость: {artifact.get('max_rarity', 'Не найдено')} звезд",
            f"Бонус 2 частей: {artifact.get('bonus_2pc') or 'Не найдено'}",
            f"Бонус 4 частей: {artifact.get('bonus_4pc') or 'Не найдено'}",
        ]
    )


def load_artifact_record(artifact_id: str) -> dict[str, Any]:
    path = DEFAULT_ARTIFACTS_DIR / f"{artifact_id}.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}
