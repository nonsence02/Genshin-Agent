# Player State Builder

`PlayerStateBuilder` creates one deterministic player-state view from imported source tables. It does not read private JSON files at runtime and does not mutate imported snapshots.

## Inputs

- GOOD `InventorySnapshot` and `InventoryItem` rows for material inventory.
- GOOD `PlayerCharacter` rows for character ascension when GOOD characters are imported.
- GOOD artifacts preserved in the latest GOOD snapshot `rawPayload.artifacts`.
- `PlayerWeapon` rows imported from `weapons.json`.
- HoYoLAB `PlayerCharacter` rows imported from `hoyolab_profile.json`.
- Normalized `Character` and `EntityAlias` rows for stable identity matching.

## Priority

- Identity: normalized `Character.stableKey`.
- Level: HoYoLAB, then GOOD, then any existing player character row.
- Ascension: GOOD, then any existing player character ascension. Missing ascension is reported as a warning.
- Constellation: HoYoLAB, then GOOD.
- Talents: HoYoLAB, then GOOD.
- Equipped weapon: HoYoLAB equipped weapon summary, then `weapons.json` location match.
- Equipped artifacts: GOOD artifacts by location, then low-confidence HoYoLAB artifact summaries.
- Inventory materials: GOOD inventory snapshots and inventory items.
- Manual inventory overrides: separate material quantity layer, not mixed into character state.

## Planner Use

When `usePlayerState` is enabled, planner services ask `PlayerStateBuilder` for the current character state. Explicit API/CLI values still override merged values. `currentAscensionPhase` is especially important because level caps are ambiguous: level 50 ascension 2 and level 50 ascension 3 require different future ascension costs.

## Conflicts

If two sources provide different values for the same field, the builder returns the chosen source and a conflict entry. The planner remains deterministic by following the documented priority order.

## Traveler And Special Cases

The builder does not guess ambiguous Traveler variants. A source record must resolve through stable keys, normalized names, or aliases. Unresolved or ambiguous records are reported as warnings for later normalization work.
