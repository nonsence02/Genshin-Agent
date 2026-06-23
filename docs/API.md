# Local API

The Fastify API exposes deterministic Genshin-Agent planner services for local development clients: future web UI, desktop UI, LLM tool wrappers, and smoke scripts. It is a thin HTTP layer over existing services; planner logic stays in `src/planner`.

This API is local/dev only. It has no authentication or user management yet. Production auth, user sessions, and upload flows are future work.

## Start

```bash
npm run dev
```

Environment variables:

- `API_HOST`: bind host, default `127.0.0.1`
- `API_PORT`: bind port, default `3000`
- `API_CORS_ORIGIN`: comma-separated allowed origins, default `http://localhost:3000,http://127.0.0.1:3000`

## Endpoints

- `GET /health`
- `GET /docs/openapi.json`
- `GET /knowledge/materials/:materialKey/sources?includeCalendar=true`
- `GET /planner/materials/:materialKey/classification`
- `GET /planner/level-costs?currentLevel=20&targetLevel=90`
- `POST /planner/character/requirements`
- `POST /planner/character/diff`
- `POST /planner/character/plan`
- `GET /player/:playerKey/state?includeArtifacts=true&characterKey=char_furina`
- `GET /player/:playerKey/characters/:characterKey/state`
- `GET /player/:playerKey/inventory/effective?snapshotId=2&includeManualOverrides=true`
- `GET /player/:playerKey/inventory/overrides`
- `PUT /player/:playerKey/inventory/overrides/:materialKey`
- `DELETE /player/:playerKey/inventory/overrides/:materialKey`
- `POST /player/:playerKey/inventory/overrides/clear`

## Examples

```bash
curl http://127.0.0.1:3000/health
```

```bash
curl "http://127.0.0.1:3000/knowledge/materials/mat_philosophies_of_justice/sources"
```

```bash
curl "http://127.0.0.1:3000/planner/level-costs?currentLevel=20&targetLevel=90"
```

```bash
curl -X POST http://127.0.0.1:3000/planner/character/requirements \
  -H "content-type: application/json" \
  -d '{
    "characterKey": "char_furina",
    "currentLevel": 20,
    "targetLevel": 90,
    "currentAscensionPhase": 0,
    "targetAscensionPhase": 6,
    "currentTalents": { "normal": 1, "skill": 1, "burst": 1 },
    "targetTalents": { "normal": 1, "skill": 9, "burst": 10 }
  }'
```

```bash
curl -X POST http://127.0.0.1:3000/planner/character/diff \
  -H "content-type: application/json" \
  -d '{
    "playerKey": "default",
    "characterKey": "char_furina",
    "inventorySnapshotId": 2,
    "usePlayerState": false,
    "currentLevel": 20,
    "targetLevel": 90,
    "currentTalents": { "normal": 1, "skill": 1, "burst": 1 },
    "targetTalents": { "normal": 1, "skill": 9, "burst": 10 },
    "withSources": true,
    "classify": true,
    "useCrafting": true,
    "includeManualOverrides": true,
    "allowDustOfAzoth": false,
    "allowDreamSolvent": false
  }'
```

```bash
curl -X POST http://127.0.0.1:3000/planner/character/plan \
  -H "content-type: application/json" \
  -d '{
    "playerKey": "default",
    "characterKey": "char_furina",
    "inventorySnapshotId": 2,
    "usePlayerState": false,
    "currentLevel": 20,
    "targetLevel": 90,
    "currentTalents": { "normal": 1, "skill": 1, "burst": 1 },
    "targetTalents": { "normal": 1, "skill": 9, "burst": 10 },
    "startDate": "2026-06-23",
    "days": 7,
    "dailyResinBudget": 180,
    "currentResin": 160,
    "discountedWeeklyBossClaimsUsed": 0,
    "useCrafting": true,
    "includeManualOverrides": true,
    "allowDustOfAzoth": false,
    "allowDreamSolvent": false
  }'
```

```bash
curl http://127.0.0.1:3000/player/default/inventory/effective
```

```bash
curl "http://127.0.0.1:3000/player/default/state?characterKey=char_furina"
```

```bash
curl http://127.0.0.1:3000/player/default/characters/char_furina/state
```

```bash
curl -X PUT http://127.0.0.1:3000/player/default/inventory/overrides/mat_heros_wit \
  -H "content-type: application/json" \
  -d '{ "mode": "absolute", "quantity": 40, "reason": "manual correction" }'
```

Manual inventory overrides are applied by default to planner diff and plan endpoints. Set `"includeManualOverrides": false` to use raw snapshot quantities. Overrides correct inventory state; crafting options are a separate virtual projection layer.

When `"usePlayerState": true`, planner diff and plan endpoints use `PlayerStateBuilder` to resolve current level, current ascension phase, and current talents. Explicit request fields still override merged state.

Errors use a consistent JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```
