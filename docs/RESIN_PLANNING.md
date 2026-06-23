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

## RunEstimateService

`RunEstimateService` provides rough deterministic estimates only where the project has an explicit assumption:

- normal boss unique ascension materials use `2.5` material per run;
- estimated normal boss runs are `ceil(missing / 2.5)`;
- domains and ley lines currently return `estimatedRuns: null` because no reliable drop model is configured;
- open-world materials consume no resin;
- every rough or null estimate emits a warning.

The service intentionally does not hardcode unverified talent book, weapon material, artifact, Mora ley line, or EXP ley line drop rates.

## FarmTaskBuilder

`FarmTaskBuilder` converts missing materials from `InventoryDiffService` into farm tasks:

- resin-gated tasks: bosses, domains, ley lines, weekly bosses, and other resin sources;
- open-world tasks: local specialties and enemy drops;
- unknown tasks: materials without usable source classification.

Domain tasks include calendar days when normalized `FarmCalendarEntry` data exists. Mora and character EXP books use curated `ley_line` source metadata until normalized upstream source data is complete.

## ResinPlanService V1

`ResinPlanService` builds a simple day-by-day resin plan. It is deterministic, useful for inspection, and deliberately not a perfect optimizer.

Defaults:

- `days`: `7`;
- `dailyResinBudget`: `180`;
- resin cap: `200`;
- `currentResin`, when provided, is added to the first day but capped by the resin cap;
- `discountedWeeklyBossClaimsUsed`: `0`.

Scheduling rules:

- daily planned resin never exceeds that day's budget;
- domain tasks with calendar days are scheduled only on matching days;
- Sunday is allowed when Sunday appears in the calendar;
- tasks without calendar days can be scheduled any day;
- tasks with known estimated runs are scheduled as integer runs;
- tasks with unknown run counts get at most one placeholder run when a resin cost and valid day are available;
- open-world tasks are listed separately and do not consume resin;
- unknown tasks are listed separately with warnings.

Priority order:

1. weekly boss / trounce domain;
2. normal boss;
3. domain available that day;
4. ley line;
5. other resin-gated tasks.

Weekly boss handling is intentionally cautious. The planner uses `WeeklyBossPolicy` for one claim's resin cost and avoids scheduling the same weekly boss source more than once per week. It does not know which bosses the player has already claimed beyond the `discountedWeeklyBossClaimsUsed` input.

Future work:

- drop-rate models;
- condensed resin;
- actual current resin from live notes;
- weekly claimed boss tracking;
- route planning;
- calendar UI;
- multi-goal optimization.

Example:

```bash
npm run plan:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10
npm run plan:character -- --player default --character char_furina --current-level 20 --target-level 90 --skill 9 --burst 10 --days 7 --json
```
