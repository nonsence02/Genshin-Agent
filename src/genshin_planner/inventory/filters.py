"""Filtering rules for GOOD inventory data.

The rules are intentionally data-driven: add keys or predicates here without
touching the parser pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Protocol


ONE_AND_TWO_STAR_WEAPON_KEYS: set[str] = {
    "DullBlade",
    "WasterGreatsword",
    "BeginnersProtector",
    "ApprenticesNotes",
    "HuntersBow",
    "SilverSword",
    "OldMercsPal",
    "IronPoint",
    "PocketGrimoire",
    "SeasonedHuntersBow",
}


THREE_STAR_WEAPON_KEYS: set[str] = {
    "BlackTassel",
    "BloodtaintedGreatsword",
    "CoolSteel",
    "DarkIronSword",
    "DebateClub",
    "EmeraldOrb",
    "FerrousShadow",
    "FilletBlade",
    "Halberd",
    "HarbingerOfDawn",
    "MagicGuide",
    "Messenger",
    "OtherworldlyStory",
    "RavenBow",
    "RecurveBow",
    "SharpshootersOath",
    "SkyriderGreatsword",
    "SkyriderSword",
    "Slingshot",
    "ThrillingTalesOfDragonSlayers",
    "TravelersHandySword",
    "TwinNephrite",
    "WhiteIronGreatsword",
    "WhiteTassel",
}


ALWAYS_DROP_MATERIAL_KEYS: set[str] = {
    # Basic ores and forge filler.
    "IronChunk",
    "WhiteIronChunk",
    "CrystalChunk",
    "MagicalCrystalChunk",
    "Starsilver",
    "AmethystLump",
    "CondessenceCrystal",
    "CondessenceCrystals",
    "EnhancementOre",
    "FineEnhancementOre",
    "MysticEnhancementOre",
}


MATERIAL_KEEP_EXACT_KEYS: set[str] = {
    "Mora",
    "Primogem",
    "Primogems",
    "FragileResin",
    "TransientResin",
    "CondensedResin",
    "OriginalResin",
    "IntertwinedFate",
    "AcquaintFate",
    "CrownOfInsight",
    "HerosWit",
    "AdventurersExperience",
    "WanderersAdvice",
}


MATERIAL_KEEP_SUBSTRINGS: tuple[str, ...] = (
    "AgnidusAgate",
    "VarunadaLazurite",
    "NagadusEmerald",
    "VajradaAmethyst",
    "VayudaTurquoise",
    "ShivadaJade",
    "PrithivaTopaz",
    "BrilliantDiamond",
    "TeachingsOf",
    "GuideTo",
    "PhilosophiesOf",
)


MATERIAL_DROP_SUBSTRINGS: tuple[str, ...] = (
    "Apple",
    "Bacon",
    "Berry",
    "BirdEgg",
    "Butter",
    "Cabbage",
    "Carrot",
    "Cheese",
    "Crab",
    "Cream",
    "Fish",
    "Flour",
    "Fowl",
    "Ham",
    "Jam",
    "LavenderMelon",
    "LotusHead",
    "Matsutake",
    "Milk",
    "Mint",
    "Mushroom",
    "Onion",
    "Pepper",
    "Pinecone",
    "Potato",
    "Radish",
    "RawMeat",
    "Rice",
    "Sausage",
    "Shrimp",
    "Snapdragon",
    "Sugar",
    "Sunsettia",
    "SweetFlower",
    "Tomato",
    "Tofu",
    "Wheat",
)


class WeaponFilter(Protocol):
    def keep(self, weapon: Mapping[str, object]) -> bool:
        """Return True when a GOOD weapon record should be kept."""


class MaterialFilter(Protocol):
    def keep(self, key: str, count: int) -> bool:
        """Return True when a GOOD material should be kept."""


@dataclass(frozen=True)
class WeaponRarityFilter:
    """Keep 4/5-star weapons and invested 3-star weapons.

    GOOD weapon objects do not contain rarity, so known 1/2-star and 3-star
    weapon keys are used as a compact static rarity index. Unknown keys are
    treated as 4/5-star to avoid dropping newly released weapons.
    """

    low_rarity_keys: set[str] = field(default_factory=lambda: ONE_AND_TWO_STAR_WEAPON_KEYS)
    three_star_keys: set[str] = field(default_factory=lambda: THREE_STAR_WEAPON_KEYS)

    def keep(self, weapon: Mapping[str, object]) -> bool:
        key = str(weapon.get("key", ""))
        level = _as_int(weapon.get("level"), default=1)
        refinement = _as_int(weapon.get("refinement"), default=1)

        if key in self.low_rarity_keys:
            return False
        if key in self.three_star_keys:
            return level > 1 or refinement > 1
        return True


@dataclass(frozen=True)
class RelevantMaterialFilter:
    """Drop obvious food/basic ore while keeping progression materials.

    The inventory planner cares about currencies, resin, EXP books, gems,
    talent books, boss drops, mob drops, local specialties, and weapon mats.
    Because the game keeps adding materials, this filter is intentionally
    permissive after removing known junk.
    """

    keep_exact: set[str] = field(default_factory=lambda: MATERIAL_KEEP_EXACT_KEYS)
    keep_substrings: tuple[str, ...] = MATERIAL_KEEP_SUBSTRINGS
    drop_exact: set[str] = field(default_factory=lambda: ALWAYS_DROP_MATERIAL_KEYS)
    drop_substrings: tuple[str, ...] = MATERIAL_DROP_SUBSTRINGS

    def keep(self, key: str, count: int) -> bool:
        if count <= 0:
            return False
        if key in self.keep_exact:
            return True
        if any(token in key for token in self.keep_substrings):
            return True
        if key in self.drop_exact:
            return False
        if any(token in key for token in self.drop_substrings):
            return False
        return True


def _as_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
