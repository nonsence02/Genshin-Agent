# Crafting And Conversion

The planner has two inventory views:

- direct inventory: the raw imported `InventorySnapshot` quantities;
- projected inventory: direct inventory plus virtual crafting and optional conversion actions.

The projection layer never mutates `InventorySnapshot` or `InventoryItem` rows. It only reports effective quantities, virtual actions, and warnings for the current planning request.

## Tier Upgrades

Tier upgrades are enabled with `--use-crafting`.

Supported v1 families:

- character talent books: `Teachings -> Guide -> Philosophies`;
- curated common enemy drop families, such as Whopperflower Nectar tiers;
- elemental gems: `Sliver -> Fragment -> Chunk -> Gemstone`;
- selected common three-tier enhancement material families.

All tier upgrades use `3` lower-tier materials to produce `1` higher-tier material. Crafting Mora cost is treated as `0` in v1 and every action carries a TODO warning because craft costs are not normalized yet.

The projection is conservative:

- it only crafts materials needed by the current requirement;
- it does not craft unrelated materials;
- it preserves lower-tier materials that are also required and would become missing;
- it does not model crafting passive bonuses, refunds, or character talents.

## Dust Of Azoth

Dust of Azoth conversion is opt-in with `--allow-dust-of-azoth`.

The planner can convert elemental gems of the same rarity between elements:

- Sliver: `1` Dust of Azoth;
- Fragment: `3` Dust of Azoth;
- Chunk: `9` Dust of Azoth;
- Gemstone: `27` Dust of Azoth.

If Dust of Azoth is unavailable or insufficient, the conversion is skipped and a warning is returned.

## Dream Solvent

Dream Solvent conversion is opt-in with `--allow-dream-solvent`.

The planner only converts weekly boss drops when both materials can be tied to the same weekly boss source group. It consumes `1` Dream Solvent per converted material and does not cross-convert between different weekly bosses. If source metadata is missing or ambiguous, it does not guess.

## Why This Helps

Craft-aware projection reduces over-farming by turning lower-tier inventory into effective higher-tier quantities before `InventoryDiffService` and `ResinPlanService` compute remaining missing materials.

Future work:

- normalize full crafting recipes and Mora craft costs;
- support character crafting passives;
- model refunds and bonus products;
- expose player-controlled reservation rules;
- improve ambiguous family/source detection.
