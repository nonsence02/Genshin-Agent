# hoyoapi Experiment

This folder is an isolated spike for checking whether the `hoyoapi` npm package
can provide richer live HoYoLAB/Genshin account data than the current static
`hoyolab_profile.json` importer.

The experiment is not part of the production player-state import pipeline. The
planner and normalizers must not depend on raw `hoyoapi` response shapes.

Run:

```bash
npm run spike:hoyoapi
npm run spike:hoyoapi -- --json --no-write
npm run spike:hoyoapi -- --out data/raw/hoyoapi/latest.sanitized.json
```

Daily check-in claiming is disabled by default. To test it, both flags are
required:

```bash
npm run spike:hoyoapi -- --claim-daily --yes
```

Set credentials in `.env.local`; never commit real cookies or generated output.
