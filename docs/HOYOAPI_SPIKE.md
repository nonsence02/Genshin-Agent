# HoYoAPI Spike

This spike tests whether the `hoyoapi` npm package can provide better live
player-state data than the current imported HoYoLAB profile JSON. It is
experimental only and is not wired into the production player-state import
pipeline.

## Environment

Use `.env.local` for real credentials. Do not commit it.

```bash
HOYOAPI_COOKIE=
HOYOAPI_UID=
HOYOAPI_LANG=en
HOYOAPI_REGION=
HOYOAPI_LTUID=
HOYOAPI_LTOKEN=
HOYOAPI_LTUID_V2=
HOYOAPI_LTOKEN_V2=
HOYOAPI_COOKIE_TOKEN_V2=
```

`HOYOAPI_COOKIE` can be used as a raw cookie string. If using object-style
credentials, set the ltuid/ltoken fields instead.

## Commands

```bash
npm run spike:hoyoapi
npm run spike:hoyoapi -- --json --no-write
npm run spike:hoyoapi -- --out data/raw/hoyoapi/latest.sanitized.json
```

Output written under `data/raw/hoyoapi/*.json` is sanitized and ignored by git.

## Endpoints Tested

- Client setup through `GenshinImpact.create(...)`, with constructor fallback.
- `record.records()`
- `record.characters()`
- `record.charactersSummary(characterIds)` when ids are discoverable.
- `record.dailyNote()`
- `daily.info()`
- `daily.rewards()`
- `daily.reward()`

`daily.claim()` is never called by default. It requires both `--claim-daily` and
`--yes`.

## Security Rules

- Never commit real cookies, tokens, account ids, or generated HoYoLAB output.
- Do not log raw response objects by default.
- Sanitized output recursively redacts cookie/token/account-like fields.
- This experiment must not become a runtime dependency for planner logic.

## Comparison Criteria

The CLI reports whether `hoyoapi` appears better, equivalent, worse, or
inconclusive compared with current sources:

- `hoyolab_profile.json`: character level, constellation, talent levels,
  equipped weapon summary, weak or incomplete artifact info.
- Inventory Kamera: materials, weapons, artifacts/items depending on the file,
  no live HoYoLAB data.

## Promotion Criteria

`hoyoapi` can become a real provider only if it reliably returns:

- character list;
- character levels;
- constellations;
- talent levels;
- equipped weapon;
- enough artifact details to be useful;
- a stable response shape or manageable normalization surface.

Future production integration should normalize `hoyoapi` output into internal
player-state tables rather than letting planner logic depend on raw API shapes.
