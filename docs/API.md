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
    "allowDustOfAzoth": false,
    "allowDreamSolvent": false
  }'
```

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
