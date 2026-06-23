from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class Coverage:
    level: bool = False
    ascension: bool = False
    rarity: bool = False
    constellation: bool = False
    talents: bool = False
    normal_talent: bool = False
    skill_talent: bool = False
    burst_talent: bool = False
    equipped_weapon: bool = False
    weapon_level: bool = False
    weapon_refinement: bool = False
    equipped_artifacts: bool = False
    artifact_set: bool = False
    artifact_slot: bool = False
    artifact_level: bool = False
    artifact_rarity: bool = False
    artifact_main_stat: bool = False
    artifact_substats: bool = False
    resin: bool = False

    def to_dict(self) -> dict[str, bool]:
        return asdict(self)


def detect_coverage(values: list[Any]) -> Coverage:
    coverage = Coverage()
    for value in values:
        _inspect(value, [], coverage)
    return coverage


def comparison_verdict(endpoint_statuses: dict[str, str], coverage: Coverage) -> str:
    if endpoint_statuses.get("calculator_characters") == "error" and endpoint_statuses.get("character_details") != "ok":
        return "inconclusive due to auth/API errors"

    core = sum(
        [
            coverage.level,
            coverage.constellation,
            coverage.talents,
            coverage.equipped_weapon,
        ]
    )
    artifacts = sum([coverage.equipped_artifacts, coverage.artifact_main_stat, coverage.artifact_substats])

    if core >= 4 and artifacts >= 2:
        return "genshin.py is better than current hoyolab_profile importer"
    if core >= 3:
        return "genshin.py is equivalent"
    return "genshin.py is worse/incomplete"


def _inspect(value: Any, path: list[str], coverage: Coverage) -> None:
    if value is None:
        return

    if hasattr(value, "dict") and callable(value.dict):
        value = value.dict()
    elif hasattr(value, "__dict__") and not isinstance(value, (dict, list, tuple, set, str, bytes)):
        value = vars(value)

    if isinstance(value, dict):
        for key, child in value.items():
            normalized = _normalize(str(key))
            next_path = [*path, normalized]
            in_artifact = any("artifact" in item or "reliqu" in item for item in next_path)
            in_weapon = any("weapon" in item for item in next_path)

            if normalized in {"level", "lv"}:
                coverage.level = True
                if in_artifact:
                    coverage.artifact_level = True
                if in_weapon:
                    coverage.weapon_level = True
            if normalized in {"ascension", "ascend", "promotelevel"}:
                coverage.ascension = True
            if normalized in {"rarity", "rank", "star", "stars"}:
                coverage.rarity = True
                if in_artifact:
                    coverage.artifact_rarity = True
            if "constellation" in normalized or normalized in {"constellationlevel", "activedconstellationnum"}:
                coverage.constellation = True
            if "talent" in normalized or "skill" in normalized:
                coverage.talents = True
            if any(marker in normalized for marker in ("normal", "basic", "autoattack")) and "talent" in "".join(next_path):
                coverage.normal_talent = True
            if any(marker in normalized for marker in ("skill", "elemental")):
                coverage.skill_talent = True
            if any(marker in normalized for marker in ("burst", "ultimate")):
                coverage.burst_talent = True
            if "weapon" in normalized:
                coverage.equipped_weapon = True
            if "refinement" in normalized or normalized in {"affixlevel", "refine"}:
                coverage.weapon_refinement = True
            if "artifact" in normalized or "reliqu" in normalized:
                coverage.equipped_artifacts = True
            if in_artifact and "set" in normalized:
                coverage.artifact_set = True
            if in_artifact and any(marker in normalized for marker in ("slot", "pos", "equiptype")):
                coverage.artifact_slot = True
            if in_artifact and "main" in normalized and any(marker in normalized for marker in ("stat", "prop", "property")):
                coverage.artifact_main_stat = True
            if in_artifact and ("sub" in normalized or "append" in normalized):
                coverage.artifact_substats = True
            if "resin" in normalized:
                coverage.resin = True

            _inspect(child, next_path, coverage)
        return

    if isinstance(value, (list, tuple, set)):
        for item in value:
            _inspect(item, path, coverage)


def _normalize(key: str) -> str:
    return "".join(ch for ch in key.lower() if ch.isalnum())
