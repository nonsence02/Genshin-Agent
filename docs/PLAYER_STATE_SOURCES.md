# Player State Sources

Player-state imports describe a player's account state. They are separate from static knowledge imports such as `genshin-db`.

## Sources

- Inventory Kamera `good.json`: materials, inventory items, artifacts, and sometimes characters.
- Inventory Kamera `weapons.json`: weapon inventory, weapon levels, refinements, locks, and locations.
- HoYoLAB profile JSON: character levels, constellations, talent levels, and equipped weapon summaries.
- Enka: optional future showcase fallback for exposed character builds.
- Manual overrides: highest-priority correction layer for user-confirmed material inventory counts.

## Priority

- HoYoLAB is preferred for character level, constellation, and talent levels.
- Inventory Kamera is preferred for material counts, weapon inventory, and artifact inventory.
- Inventory Kamera is preferred for equipped artifacts when reliable location data is available.
- HoYoLAB artifact data is low confidence when set names or main stats are blank.
- Manual overrides beat imported material inventory snapshots by default.

## Current Scope

`PlayerSourceImportService` imports local player source files into player-state tables where practical. It reports unresolved materials, weapons, and characters without guessing. It does not calculate missing materials, optimize resin, or call LLM tools.

`InventoryDiffService` resolves effective inventory from `InventorySnapshot`/`InventoryItem` plus active `ManualInventoryOverride` rows by default. Use `--no-manual-overrides` or `includeManualOverrides: false` to inspect raw imported snapshot quantities. When `--use-player-state` is used, imported HoYoLAB profile character rows provide current character level, ascension, and talent levels.
