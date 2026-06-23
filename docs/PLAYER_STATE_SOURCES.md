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

`PlayerSourceImportService` imports local player source files into player-state tables where practical. GOOD characters are stored as `PlayerCharacter` rows with source `inventory-kamera-good`, and GOOD artifacts are preserved in the GOOD snapshot raw payload for later inspection. It reports unresolved materials, weapons, and characters without guessing. It does not calculate missing materials, optimize resin, or call LLM tools.

`PlayerStateBuilder` merges imported GOOD, `weapons.json`, and HoYoLAB rows into one explainable character state. When `--use-player-state` is used, `InventoryDiffService` asks this builder for current level, ascension phase, and talents. Use `--no-manual-overrides` or `includeManualOverrides: false` to inspect raw imported snapshot quantities.

## Updating Sources

The web prototype can upload local `good.json`, `weapons.json`, and `hoyolab_profile.json` files through the Fastify API. The upload layer writes files to an ignored temporary directory, validates that each JSON file matches the selected source field, and then calls `PlayerSourceImportService`. It does not duplicate parsing or normalization logic.

The CLI remains available for the same shared service:

```bash
npm run import:player-sources -- --player default --good data/raw/user_imports/good.json --weapons data/raw/user_imports/weapons.json --hoyolab data/raw/user_imports/hoyolab_profile.json
```

Private exports should stay under ignored paths such as `data/raw/user_imports/*.json` or be uploaded through the UI. Do not commit player source JSON.
