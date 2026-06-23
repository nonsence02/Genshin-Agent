# Manual Inventory Overrides

Inventory snapshots are imported source data. They should remain immutable so scanner/OCR mistakes can be inspected later and imports can be replayed.

Manual inventory overrides are a user-confirmed correction layer stored in `ManualInventoryOverride`. Planner services resolve effective inventory before calculating diffs or plans:

```text
delta mode:    effectiveQuantity = max(0, snapshotQuantity + quantity)
absolute mode: effectiveQuantity = quantity
```

If an override exists for a material that is not present in the snapshot, the snapshot quantity is treated as `0`.

## Modes

- `absolute`: replaces the snapshot count for one material.
- `delta`: adds a positive or negative correction to the snapshot count.

Negative delta results are clamped to `0` and emitted as warnings.

## Planner Behavior

Overrides are applied by default in `InventoryDiffService` and `ResinPlanService`. Pass `includeManualOverrides: false` through the API, or `--no-manual-overrides` in CLI commands, to compare against the raw imported snapshot only.

Overrides are not crafting projection. Overrides correct player inventory state; crafting projection virtually converts materials after effective inventory is resolved.

## Auditability

The imported `InventorySnapshot` and `InventoryItem` rows are never mutated. Override rows include mode, quantity, reason, active state, timestamps, and optional metadata. The current schema keeps one override row per player/material and deactivates rows instead of deleting them from normal application flows.

Future improvements:

- partial unique indexes for multiple historical rows with one active override;
- richer UI history;
- material search/autocomplete;
- per-account/user authorization.
