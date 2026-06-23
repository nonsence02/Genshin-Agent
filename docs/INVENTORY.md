# Inventory

Inventory Kamera GOOD JSON is a player-state source. It is not knowledge data and should not define game rules or material metadata.

`InventoryImportService` reads a local GOOD JSON file, creates an `InventorySnapshot`, and stores normalized `InventoryItem` rows. Item names are resolved through normalized `Material` and `EntityAlias` records when possible. Unresolved items are still preserved in the snapshot items with their raw names when the schema allows it, and the import report lists unresolved examples.

The inventory import does not calculate missing materials, compare against goals, optimize resin, or call an LLM. `InventoryDiffService` is the next deterministic layer that will compare imported player inventory against planner requirements.

Private GOOD exports should not be committed. Tests use a small synthetic fixture under `tests/fixtures/`.
