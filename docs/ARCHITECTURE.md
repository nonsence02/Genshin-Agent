# Genshin-Agent Architecture

Genshin-Agent is a deterministic progression planning system with an LLM-facing orchestration layer. The LLM does not calculate game requirements manually, estimate material costs, or infer resin plans from prose. It calls tools and services that own the game rules, player state, and planner math.

PostgreSQL is the internal source of truth for normalized knowledge and player state. Upstream packages and files, including `genshin-db` and Inventory Kamera GOOD JSON, are inputs to ingestion only. Their raw objects are stored in JSONB for debugging, reimporting, and comparing upstream versions, then important entities are normalized into stable internal tables.

## Module Boundaries

### knowledge

Owns normalized game entities such as characters, weapons, materials, domains, enemies, artifact sets, aliases, costs, drops, rewards, and farm calendar entries. Normalized records use stable keys such as `char_furina`, `mat_lakelight_lily`, `domain_some_domain`, and `enemy_some_enemy`.

### ingestion

Imports upstream data into the raw layer and coordinates normalization. `genshin-db` is an upstream data source, not the runtime business model. Import runs should record source, version, status, and error details so data can be audited and replayed.

### player-state

Owns players, linked accounts, inventory snapshots, inventory items, owned characters, owned weapons, manual overrides, and goals. Inventory Kamera GOOD JSON should be imported as immutable snapshots; manual corrections should be separate records so the original import remains inspectable.

### planner

Owns deterministic progression planning. Planner services calculate requirements, compare them with player state, and produce tasks. The planner must not depend on prompt text for game math. Tests should cover every planner calculation before it is treated as reliable.

### agent

Owns LLM orchestration and tool registration. The agent translates user intent into structured service calls and summarizes service results. It does not invent material requirements, farm schedules, or resin outcomes.

### api

Exposes application operations to clients and future UI surfaces. API handlers should call services from `planner`, `player-state`, `knowledge`, and `agent` rather than reaching directly into upstream data.

### map-routes

Owns map locations, farming routes, and ordered route nodes. This module should later support local specialty routes, enemy farming paths, and route optimization based on player goals.

### calendar

Owns day-based availability such as talent book domains, weapon material domains, bosses, and time-gated farming windows. Calendar data should be normalized from upstream sources and joined by stable domain/material keys.

### infra

Owns infrastructure wiring such as database clients, environment configuration, job bootstrapping, and local development services.

## Data Layers

### Raw Import Layer

Raw upstream objects are stored in `RawGameObject` with source metadata such as source name, folder, external key, and source version. This preserves enough information to debug normalizer behavior, compare upstream updates, and reimport without guessing what the original data looked like.

### Normalized Knowledge Layer

Normalized tables store the stable internal representation used by services. Important relationships, such as character ascension costs, talent costs, weapon costs, domain rewards, enemy drops, and farm calendar entries, are stored as relational rows with database IDs for relations and unique stable keys for lookup.

### Player State Layer

Player data is separated from knowledge. Snapshots represent what was imported at a point in time, while overrides and goals represent user intent or manual corrections.

### Planner Layer

Planner runs and tasks record deterministic planning outputs for a player at a point in time. A future planner can compare multiple runs, explain why a task exists, and show which inventory snapshot was used.
