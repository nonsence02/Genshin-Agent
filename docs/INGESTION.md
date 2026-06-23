# Ingestion

`genshin-db` is an upstream data source. Its package version and object shapes can change, so raw objects are imported into PostgreSQL before any normalization happens.

The raw import writes one `ImportRun` and many `RawGameObject` rows. Each raw object records:

- `source`, currently `genshin-db`
- installed `sourceVersion`
- upstream `folder`
- upstream `externalKey`
- raw JSON payload
- stable SHA-256 hash of the raw JSON

The import is idempotent for `source`, `sourceVersion`, `folder`, and `externalKey`; rerunning the same import updates the existing raw row.

Raw objects are for inspection, debugging, auditing, and future re-normalization. Planner services and agent tools must not depend directly on raw `genshin-db` object shapes. Normalizers that produce stable internal entities will be implemented in later commits.

## Normalization Layer

Raw objects are imported first, then selected upstream folders are normalized into stable internal tables. The first normalization step covers `Character`, `Material`, and `EntityAlias`.

Normalized entities use deterministic stable keys such as `char_furina` and `mat_teachings_of_justice`. Planner services and agent tools should use these normalized tables instead of depending on raw `genshin-db` payload shapes.

Character and material normalization is intentionally conservative: it maps direct fields such as name, rarity, element, weapon type, category, and aliases. Costs, domains, enemies, material sources, multilingual aliases, and farm calendar relationships will be normalized in later commits.
