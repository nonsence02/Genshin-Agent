# Planner

## CharacterRequirementService

`CharacterRequirementService` is deterministic gameplay logic. It turns a character upgrade goal into aggregated material requirements using normalized relational tables:

- `Character`
- `CharacterAscensionCost`
- `CharacterTalentCost`
- `Material`

The service does not read raw `genshin-db` payloads. Raw imports and normalization happen earlier in ingestion, and planner services consume only stable internal models.

The service currently calculates character ascension and generic combat talent requirements. It aggregates identical materials across ascension, normal attack, skill, and burst goals, while preserving a breakdown that explains which phase or talent level caused each quantity.

It does not compare against player inventory, import Inventory Kamera data, optimize resin, choose farming routes, or call an LLM. Those are later services that can consume this deterministic result.

## InventoryDiffService

`InventoryDiffService` is the first complete user-facing planning primitive. It compares deterministic character upgrade requirements against a player's imported inventory snapshot.

The service:

- calls `CharacterRequirementService` for all character ascension and talent requirement math;
- loads `Player`, `InventorySnapshot`, and `InventoryItem` rows from player state;
- aggregates owned material quantities by normalized `Material.id`;
- ignores unresolved inventory rows that do not have a resolved `materialId`;
- reports required, owned, and missing quantities for each required material;
- can optionally use imported `PlayerCharacter` state for current level, ascension, and talent levels.

The service does not optimize resin, infer farming routes, call an LLM, or calculate weapon/artifact goals. Manual inventory overrides are noted as future work and are not applied yet.

Example:

```bash
npm run diff:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10
npm run diff:character -- --player default --character char_furina --target-level 90 --skill 9 --burst 10 --use-player-state
```

This keeps the planner deterministic: the LLM can later call a tool wrapping this service, but the material diff itself is ordinary service logic over normalized database rows.
