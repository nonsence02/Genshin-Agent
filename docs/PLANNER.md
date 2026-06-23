# Planner

## CharacterRequirementService

`CharacterRequirementService` is deterministic gameplay logic. It turns a character upgrade goal into aggregated material requirements using normalized relational tables:

- `Character`
- `CharacterAscensionCost`
- `CharacterTalentCost`
- `Material`

The service does not read raw `genshin-db` payloads. Raw imports and normalization happen earlier in ingestion, and planner services consume only stable internal models.

The service currently calculates character ascension and generic combat talent requirements. It aggregates identical materials across ascension, normal attack, skill, and burst goals, while preserving a breakdown that explains which phase or talent level caused each quantity.

It does not compare against player inventory, import Inventory Kamera data, optimize resin, choose farming routes, or call an LLM. Those are later services that can consume this deterministic result.
