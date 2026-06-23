# Player Data Import UI

The local web prototype includes an **Update player data** panel so a developer can refresh player state without running CLI commands.

## Supported files

- Inventory Kamera GOOD export, usually `good.json`, uploaded as `good`.
- Inventory Kamera weapons export, usually `weapons.json`, uploaded as `weapons`.
- Local HoYoLAB profile export, usually `hoyolab_profile.json`, uploaded as `hoyolab`.

GOOD/Inventory Kamera remains the primary full inventory source for material counts, weapon inventory, and artifact inventory. HoYoLAB profile remains a character-state source for level, constellation, talents, equipped weapon summaries, and weak artifact summaries. `PlayerStateBuilder` merges these imported sources into one explainable player state.

## Preview vs Import

Preview calls `POST /player/:playerKey/import/source-files/preview`. It validates and parses uploaded files, then runs the shared player-source import service with `dryRun=true`.

Import calls `POST /player/:playerKey/import/source-files`. It uses the same service with `dryRun=false`, writes normalized player-state rows to PostgreSQL, and then shows a small player-state summary.

Both endpoints accept any subset of the three files. They do not require GOOD, weapons, and HoYoLAB files to be uploaded together.

## Privacy

Uploaded files are local development inputs. The API writes multipart uploads to `data/tmp/uploads/` only long enough to call the existing import service, then deletes them unless `keepTemp=true` is explicitly passed. The temporary upload directory and private raw data folders are ignored by git.

The API response includes counts, warnings, filenames, and sizes. It does not echo raw private JSON content.

## CLI Alternative

The CLI remains available:

```bash
npm run import:player-sources -- --player default --good data/raw/user_imports/good.json --weapons data/raw/user_imports/weapons.json --hoyolab data/raw/user_imports/hoyolab_profile.json
```

Use preview in the UI before import when checking a new export shape or debugging unresolved entities.
