# Knowledge Normalization

Knowledge normalization converts upstream `genshin-db` raw objects into stable internal PostgreSQL tables. The raw JSONB layer remains the debugging and reimport source, but planner services must not depend on raw upstream object shapes.

## Current Order

Run broad normalization in this order:

```bash
npm run normalize:game-data -- --section materials
npm run normalize:game-data -- --section domains
npm run normalize:game-data -- --section enemies
npm run normalize:game-data -- --section material-sources
npm run normalize:game-data -- --section farm-calendar
```

`npm run normalize:game-data` runs the full current sequence, including characters and character costs.

## Material Sources

Material source normalization combines several normalized inputs:

- material payload source hints, when they can be classified conservatively;
- `DomainReward` rows extracted from domain reward previews;
- `EnemyDrop` rows extracted from enemy reward previews;
- `FarmCalendarEntry` rows extracted from domain `daysOfWeek`.

The normalizers are intentionally defensive. If a source string cannot be resolved safely, the run records a warning and continues. This avoids pretending that fuzzy text is stable gameplay logic.

## Planner Contract

`MaterialSourceService` reads only normalized tables:

- `Material`
- `MaterialSource`
- `FarmCalendarEntry`

It does not inspect raw `genshin-db` payloads. The lookup is deterministic and returns stable material identity, sorted source summaries, optional calendar days, and warnings when source data is absent.

Resin optimization, map routes, pathfinding, and weapon upgrade planning are future work.
