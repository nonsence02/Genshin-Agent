# genshin.py Comparison

This experiment compares three views of character state:

- local `data/raw/user_imports/hoyolab_profile.json`;
- imported `PlayerCharacter` rows in PostgreSQL;
- sanitized `genshin.py` experiment output from `data/raw/genshin_py/latest.sanitized.json`.

The goal is QA and source selection. This tool does not promote `genshin.py` into production ingestion, does not call the planner, and does not write unsanitized HoYoLAB or `genshin.py` payloads.

## Current Source Priority

1. Inventory Kamera GOOD remains the full inventory source for materials, weapons, and artifacts because it is a local user-controlled inventory snapshot.
2. `hoyolab_profile.json` remains the current character-state source for level, constellation, talent levels, and equipped weapon summary.
3. `genshin.py` is experimental. It may provide richer character details, daily/resin information, and possibly better artifact details, but its response shape must prove stable first.
4. Manual overrides are a future highest-priority correction layer for user-entered fixes.

## Compared Fields

The comparison checks identity and state fields:

- source key, normalized key, resolved `Character.stableKey`, English name, Russian name;
- level, ascension, constellation;
- normal attack, skill, and burst talent levels;
- equipped weapon name, level, refinement, and rarity;
- artifact count, slots, names, set names, levels, rarities, main stats, and substats.

Matching is conservative. Characters are matched by stable key, normalized source key, database `Character.stableKey`, English name, and Russian name only when it is already represented in the local data. Risky fuzzy matches are left unmatched.

## Promotion Criteria

`genshin.py` can become a production provider only if it reliably provides:

- all owned characters;
- character levels;
- constellation;
- normal, skill, and burst talent levels;
- equipped weapon name, level, and refinement;
- useful equipped artifact data, including main stats and substats;
- a stable sanitized response shape across runs.

Until those criteria are met, `genshin.py` stays under `src/experiments`.

## Commands

```bash
npm run compare:genshin-py -- --player default
npm run compare:genshin-py -- --player default --json
npm run compare:genshin-py -- --player default --out data/raw/genshin_py/comparison.latest.json
```

`data/raw/genshin_py/*.json` and `data/raw/user_imports/*.json` are ignored and must not be committed.
