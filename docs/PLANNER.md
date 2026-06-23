# Planner

## CharacterRequirementService

`CharacterRequirementService` is deterministic gameplay logic. It turns a character upgrade goal into aggregated material requirements using normalized relational tables:

- `Character`
- `CharacterAscensionCost`
- `CharacterTalentCost`
- `Material`

The service does not read raw `genshin-db` payloads. Raw imports and normalization happen earlier in ingestion, and planner services consume only stable internal models.

The service currently calculates character ascension and generic combat talent requirements. It aggregates identical materials across ascension, normal attack, skill, and burst goals, while preserving a breakdown that explains which phase or talent level caused each quantity.

It also includes character level EXP requirements through `CharacterLevelCostService`. Level EXP is converted into normalized EXP book materials (`mat_heros_wit`, `mat_adventurers_experience`, `mat_wanderers_advice`) and level-up Mora (`mat_mora`). The level curve is a static deterministic planner constant documented in `docs/CHARACTER_LEVELING.md`.

It does not compare against player inventory, import Inventory Kamera data, optimize resin, choose farming routes, or call an LLM. Those are later services that can consume this deterministic result.

## MaterialSourceService

`MaterialSourceService` explains where a normalized material can be obtained. It reads normalized `MaterialSource` and `FarmCalendarEntry` rows, not raw `genshin-db` JSON.

The service is deterministic:

- material identity is resolved by `Material.stableKey` or `Material.id`;
- sources are sorted in a stable order: domain, boss, weekly boss, enemy, local specialty, then other source types;
- domain calendar days are returned when normalized farm calendar rows exist;
- curated ley line sources are supplied for Mora and character EXP books until normalized upstream source data is complete;
- missing source data returns a warning instead of guessing.

Example:

```bash
npm run sources:material -- --material mat_philosophies_of_justice
npm run sources:material -- --material mat_lakelight_lily --json
```

Source data may be incomplete because it depends on what upstream `genshin-db` exposes and what has been normalized so far. Resin efficiency and map routes are future planner layers.

## ResinPolicy And MaterialDemandClassifier

`ResinPolicy` and `WeeklyBossPolicy` encode reusable resin rules before the full optimizer exists. They cover resin cap, natural regeneration, static source costs, and weekly boss discounted claim costs.

`MaterialDemandClassifier` uses normalized material sources to mark missing materials as resin-gated, open-world, weekly-boss-gated, and calendar-bound. It does not estimate drop rates, run counts, routes, or schedules.

Mora and character EXP books are treated as ley-line-primary demand when a ley line source is available. This is source classification only; it is not resin optimization.

Examples:

```bash
npm run classify:material -- --material mat_water_that_failed_to_transcend
npm run classify:material -- --material mat_lakelight_lily --json
```

Weekly boss cost is dynamic: each weekly boss reward can be claimed once per week, the first 3 weekly boss reward claims cost 30 resin, and later claims cost 60 resin. Current planner code does not track claimed bosses yet.

## InventoryDiffService

`InventoryDiffService` is the first complete user-facing planning primitive. It compares deterministic character upgrade requirements against a player's imported inventory snapshot.

The service:

- calls `CharacterRequirementService` for all character level EXP, ascension, and talent requirement math;
- loads `Player`, `InventorySnapshot`, and `InventoryItem` rows from player state;
- aggregates owned material quantities by normalized `Material.id`;
- ignores unresolved inventory rows that do not have a resolved `materialId`;
- reports required, owned, and missing quantities for each required material;
- can optionally use imported `PlayerCharacter` state for current level, ascension, and talent levels.

The service does not optimize resin, infer farming routes, call an LLM, or calculate weapon/artifact goals. Manual inventory overrides are noted as future work and are not applied yet.

Example:

```bash
npm run diff:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10
npm run diff:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10 --with-sources
npm run diff:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10 --with-sources --classify
npm run diff:character -- --player default --character char_furina --target-level 90 --skill 9 --burst 10 --use-player-state
```

This keeps the planner deterministic: the LLM can later call a tool wrapping this service, but the material diff itself is ordinary service logic over normalized database rows.

## ResinPlanService V1

`ResinPlanService` turns a character goal into a simple farming plan:

- calls `InventoryDiffService` to get missing normalized materials;
- uses `FarmTaskBuilder` to classify missing materials into resin-gated, open-world, and unknown tasks;
- uses `RunEstimateService` for rough deterministic run estimates;
- schedules resin tasks day by day with a fixed resin budget and domain calendar constraints;
- lists open-world tasks separately instead of consuming resin for them.

This is not the full optimizer. It does not estimate exact random drops, use condensed resin, read live current resin, track already claimed weekly bosses, route open-world materials, or optimize multiple goals together.

Default assumptions:

- daily resin budget: `180`;
- resin cap: `200`;
- normal boss unique ascension materials: rough `2.5` material per run;
- talent domains, weapon domains, artifact domains, and ley lines do not have precise run estimates yet unless a reliable model is added later.

The schedule is deterministic and priority ordered:

1. weekly boss / trounce domain tasks;
2. normal boss tasks;
3. domain tasks available on that day;
4. ley line tasks;
5. other resin-gated tasks.

Weekly boss tasks use `WeeklyBossPolicy` for the resin cost of one cautious claim and avoid duplicate claims for the same source within the v1 plan window. This does not replace future weekly claimed-boss tracking.

Example:

```bash
npm run plan:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10
npm run plan:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10 --days 7 --json
npm run plan:character -- --player default --character char_furina --target-level 90 --skill 10 --burst 10 --use-player-state
```
