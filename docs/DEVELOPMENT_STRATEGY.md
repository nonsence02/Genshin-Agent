# Development Strategy

Genshin-Agent should grow in small, reviewable steps. Prefer one logical change per commit: schema changes, ingestion behavior, planner calculations, API endpoints, and agent tool wiring should usually be separate commits.

The main branch should stay stable. New planner behavior should be introduced behind clear service boundaries and backed by tests before it is used by the agent. Do not rewrite existing working scripts unless the change is necessary for the current task.

## Commit Discipline

- Keep commits small and focused.
- Preserve existing functionality unless the task explicitly changes it.
- Avoid mixing generated data refreshes with source changes.
- Never commit real secrets, local credentials, or private player exports.
- Include documentation updates when architecture or workflows change.

## Suggested Implementation Order

1. Establish local PostgreSQL, Prisma schema, and module boundaries.
2. Import raw `genshin-db` objects into the raw JSONB layer.
3. Normalize characters, weapons, materials, domains, enemies, aliases, and sources into stable internal tables.
4. Import Inventory Kamera GOOD JSON into immutable inventory snapshots.
5. Add deterministic character, talent, and weapon requirement calculations.
6. Add inventory diffing against player snapshots and manual overrides.
7. Add farm calendar lookups for domain and material availability.
8. Add resin optimization once requirement and availability calculations are covered by tests.
9. Register agent tools that call services and return structured results.
10. Add API routes after the service contracts are stable.

## Testing Expectations

Every planner calculation should have tests. Requirement totals, inventory diffs, resin estimates, calendar availability, and route assumptions should be covered with fixed fixtures. Pending tests are acceptable while scaffolding, but implemented planner logic should not remain untested.
