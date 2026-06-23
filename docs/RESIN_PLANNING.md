# Resin Planning

This layer defines deterministic resin policy primitives for future planning. It does not schedule farming days, estimate drop rates, calculate required runs, optimize routes, or call an LLM.

## ResinPolicy

`ResinPolicy` centralizes stable resin constants:

- Original Resin cap: `200`
- Natural regeneration: `1` resin every `8` minutes
- Natural resin per 24h: `180`
- Domain reward cost: `20`
- Ley Line reward cost: `20`
- Normal boss reward cost: `40`

It maps normalized source types to base costs:

- `domain`, `artifact_domain`, `talent_domain`, `weapon_domain`: `20`
- `ley_line`: `20`
- `boss`, `normal_boss`: `40`
- `weekly_boss`, `trounce_domain`: dynamic weekly boss policy
- `local_specialty`, `enemy`, `shop`, `crafting`, `expedition`, `event`, `unknown`: no base resin cost

`unknown` is not assumed to be resin-gated.

## WeeklyBossPolicy

Weekly bosses are special because their cost depends on weekly discounted claim count:

- each weekly boss reward can be claimed once per week;
- the first 3 weekly boss reward claims per week cost `30` resin;
- later weekly boss reward claims cost `60` resin;
- weekly reset is Monday at 04:00 server time.

The current policy calculates costs for planned weekly boss claims given how many discounted claims were already used. It does not track which bosses were claimed. That belongs to future player live-state / weekly-state work.

## MaterialDemandClassifier

`MaterialDemandClassifier` combines a material requirement/diff row with normalized `MaterialSourceService` output. It classifies:

- source types;
- primary source type;
- resin-gated vs non-resin-gated;
- resin cost per run when static;
- weekly boss status;
- open-world status;
- calendar days;
- warnings for unknown or missing source data.

It does not estimate run counts, drop rates, schedules, route paths, or resin efficiency. Full `ResinOptimizerService` remains future work.

Mora and character EXP books have curated `ley_line` source metadata so they can be marked as resin-gated at a 20 resin base cost. This is intentionally a classification layer, not a planner that decides whether the user should farm ley lines.

Examples:

```bash
npm run classify:material -- --material mat_water_that_failed_to_transcend
npm run classify:material -- --material mat_philosophies_of_justice
npm run classify:material -- --material mat_mora
npm run classify:material -- --material mat_heros_wit
npm run diff:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10 --with-sources --classify
```
