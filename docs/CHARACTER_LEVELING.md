# Character Leveling

Character level EXP and level-up Mora are deterministic planner constants for now. The legacy Python calculator in `scripts/tools/calculator.py` covers ascension and talent material totals, but it does not expose the full character EXP curve, EXP book planning, or level-up Mora calculation.

## Scope

`CharacterLevelCostService` calculates:

- total character EXP between two levels;
- EXP books needed using a deterministic book strategy;
- level-up Mora for consumed EXP book value;
- overflow EXP caused by book granularity.

It does not calculate ascension materials, talent materials, resin schedules, route paths, or farming optimization.

## Data

The current level curve is stored in `src/planner/data/characterLevelCurve.ts` as cumulative EXP from level 1 to 90. The constants are kept in code because the normalized `genshin-db` tables do not yet provide this curve directly.

EXP books are normalized material keys:

- `mat_heros_wit`: 20,000 EXP
- `mat_adventurers_experience`: 5,000 EXP
- `mat_wanderers_advice`: 1,000 EXP
- `mat_mora`: level-up Mora

The default strategy is `minimal_waste`: round required EXP up to the nearest 1,000, then use larger books first. This keeps overflow below 1,000 EXP while remaining deterministic. A `hero_wit_first` strategy exists for rough planning and may over-consume more EXP.

Level-up Mora is calculated as consumed book EXP divided by 5. This means Mora follows the selected book strategy and includes any unavoidable overflow.

Reference pages used to cross-check the static curve and book values:

- https://www.brandonfowler.me/genshin-exp-calc/character/
- https://genshin-impact.fandom.com/wiki/Character_EXP

## CLI

```bash
npm run costs:level -- --current-level 20 --target-level 90
npm run costs:level -- --current-level 20 --target-level 90 --json
```

The CLI does not need PostgreSQL because it only reads static planner constants.
