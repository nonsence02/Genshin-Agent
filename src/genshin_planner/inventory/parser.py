"""Parser for GOOD inventory exports from Inventory Kamera."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from .filters import RelevantMaterialFilter, WeaponFilter, WeaponRarityFilter


@dataclass(frozen=True)
class TalentLevels:
    auto: int = 1
    skill: int = 1
    burst: int = 1


@dataclass(frozen=True)
class Character:
    key: str
    level: int = 1
    ascension: int = 0
    constellation: int = 0
    talent: TalentLevels = field(default_factory=TalentLevels)


@dataclass(frozen=True)
class Weapon:
    key: str
    level: int = 1
    ascension: int = 0
    refinement: int = 1
    location: str = ""
    lock: bool = False
    id: int | None = None


@dataclass(frozen=True)
class Material:
    key: str
    count: int


@dataclass(frozen=True)
class Inventory:
    characters: tuple[Character, ...] = ()
    weapons: tuple[Weapon, ...] = ()
    materials: tuple[Material, ...] = ()
    source_files: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


ManualOverrides = Mapping[str, Sequence[Mapping[str, Any]]] | None


class InventoryParser:
    """Load, merge, filter, and normalize one or more GOOD JSON files."""

    def __init__(
        self,
        manual_overrides: ManualOverrides = None,
        weapon_filters: Sequence[WeaponFilter] | None = None,
        material_filter: RelevantMaterialFilter | None = None,
    ) -> None:
        self.manual_overrides = manual_overrides or {}
        self.weapon_filters = tuple(weapon_filters or (WeaponRarityFilter(),))
        self.material_filter = material_filter or RelevantMaterialFilter()

    def parse_directory(self, directory: str | Path) -> Inventory:
        root = Path(directory)
        if not root.exists():
            raise FileNotFoundError(f"Inventory directory does not exist: {root}")
        if not root.is_dir():
            raise NotADirectoryError(f"Expected directory with GOOD JSON files: {root}")

        payloads: list[tuple[Path, Mapping[str, Any]]] = []
        for file_path in sorted(root.glob("*.json")):
            payload = self._load_good_json(file_path)
            if payload is not None:
                payloads.append((file_path, payload))

        return self._parse_payloads(payloads)

    def parse_file(self, file_path: str | Path) -> Inventory:
        path = Path(file_path)
        payload = self._load_good_json(path)
        if payload is None:
            raise ValueError(f"Not a GOOD inventory JSON file: {path}")
        return self._parse_payloads([(path, payload)])

    def _parse_payloads(self, payloads: Iterable[tuple[Path, Mapping[str, Any]]]) -> Inventory:
        character_records: list[Mapping[str, Any]] = []
        weapon_records: list[Mapping[str, Any]] = []
        material_records: list[Mapping[str, Any]] = []
        source_files: list[str] = []

        for path, payload in payloads:
            source_files.append(str(path))
            character_records.extend(_iter_records(payload.get("characters")))
            weapon_records.extend(_iter_records(payload.get("weapons")))
            material_records.extend(_iter_material_records(payload.get("materials")))

        character_records.extend(self.manual_overrides.get("characters", ()))
        weapon_records.extend(self.manual_overrides.get("weapons", ()))
        material_records.extend(self.manual_overrides.get("materials", ()))

        return Inventory(
            characters=self._merge_characters(character_records),
            weapons=self._merge_weapons(weapon_records),
            materials=self._merge_materials(material_records),
            source_files=tuple(source_files),
        )

    def _merge_characters(self, records: Iterable[Mapping[str, Any]]) -> tuple[Character, ...]:
        by_key: dict[str, Character] = {}

        for record in records:
            character = _parse_character(record)
            if character is None:
                continue
            current = by_key.get(character.key)
            if current is None or _character_score(character) > _character_score(current):
                by_key[character.key] = character

        return tuple(sorted(by_key.values(), key=lambda item: item.key))

    def _merge_weapons(self, records: Iterable[Mapping[str, Any]]) -> tuple[Weapon, ...]:
        weapons: list[Weapon] = []
        seen: set[tuple[Any, ...]] = set()

        for record in records:
            if not all(weapon_filter.keep(record) for weapon_filter in self.weapon_filters):
                continue
            weapon = _parse_weapon(record)
            if weapon is None:
                continue
            fingerprint = (
                weapon.key,
                weapon.level,
                weapon.ascension,
                weapon.refinement,
                weapon.location,
                weapon.lock,
                weapon.id,
            )
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            weapons.append(weapon)

        return tuple(
            sorted(
                weapons,
                key=lambda item: (
                    -item.level,
                    -item.ascension,
                    item.key,
                    item.location,
                    item.id if item.id is not None else 10**9,
                ),
            )
        )

    def _merge_materials(self, records: Iterable[Mapping[str, Any]]) -> tuple[Material, ...]:
        counts: dict[str, int] = {}

        for record in records:
            key = str(record.get("key", "")).strip()
            count = _as_int(record.get("count"), default=0)
            if not key or not self.material_filter.keep(key, count):
                continue
            # Split scans should not overlap. If they do, max avoids doubling a
            # full inventory scan accidentally imported twice.
            counts[key] = max(counts.get(key, 0), count)

        materials = [Material(key=key, count=count) for key, count in counts.items()]
        return tuple(sorted(materials, key=lambda item: item.key))

    @staticmethod
    def _load_good_json(file_path: Path) -> Mapping[str, Any] | None:
        try:
            with file_path.open("r", encoding="utf-8") as stream:
                payload = json.load(stream)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in {file_path}: {exc}") from exc

        if not isinstance(payload, Mapping):
            return None
        if payload.get("format") != "GOOD":
            return None
        return payload


def _iter_records(value: object) -> Iterable[Mapping[str, Any]]:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, Mapping):
                yield item


def _iter_material_records(value: object) -> Iterable[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        for key, count in value.items():
            yield {"key": key, "count": count}
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, Mapping):
                yield item


def _parse_character(record: Mapping[str, Any]) -> Character | None:
    key = str(record.get("key", "")).strip()
    if not key:
        return None

    talent = record.get("talent", {})
    if not isinstance(talent, Mapping):
        talent = {}

    return Character(
        key=key,
        level=_as_int(record.get("level"), default=1),
        ascension=_as_int(record.get("ascension"), default=0),
        constellation=_as_int(record.get("constellation"), default=0),
        talent=TalentLevels(
            auto=_as_int(talent.get("auto"), default=1),
            skill=_as_int(talent.get("skill"), default=1),
            burst=_as_int(talent.get("burst"), default=1),
        ),
    )


def _parse_weapon(record: Mapping[str, Any]) -> Weapon | None:
    key = str(record.get("key", "")).strip()
    if not key:
        return None

    return Weapon(
        key=key,
        level=_as_int(record.get("level"), default=1),
        ascension=_as_int(record.get("ascension"), default=0),
        refinement=_as_int(record.get("refinement"), default=1),
        location=str(record.get("location", "") or ""),
        lock=bool(record.get("lock", False)),
        id=_optional_int(record.get("id")),
    )


def _character_score(character: Character) -> tuple[int, int, int, int, int, int]:
    return (
        character.level,
        character.ascension,
        character.constellation,
        character.talent.auto,
        character.talent.skill,
        character.talent.burst,
    )


def _as_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
