# UI Prototype

The web UI prototype proves the local planning loop against the deterministic Fastify API. It lets a user enter a player, character, level and talent goals, load merged player state, toggle crafting/manual override options, request a plan, and inspect missing materials, crafting actions, resin schedule, open-world tasks, warnings, and raw JSON.

It is intentionally local/dev only.

## Run

Start the API:

```bash
npm run dev
```

Start the frontend:

```bash
npm run web:dev
```

Start both API and frontend:

```bash
npm run dev:all
```

Build the frontend:

```bash
npm run web:build
```

Frontend environment:

- `VITE_API_BASE_URL`: API base URL, default `http://127.0.0.1:3000`

Example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3000 npm run web:dev
```

## Current Limitations

- no authentication;
- no file upload;
- no agent chat;
- no persistent manual plan edits;
- local/dev only;
- character search/dropdowns are not implemented yet;
- result display is a prototype over existing planner response shapes.
- manual override material entry uses raw material keys; search/autocomplete is future work.

The UI calls `/health` on load. If the API is offline, it shows a local warning with the expected start command or `VITE_API_BASE_URL` override. The "Load character state" button calls `/player/:playerKey/characters/:characterKey/state` and fills current level, ascension phase, and current talents from `PlayerStateBuilder`.
