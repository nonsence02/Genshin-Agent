# genshin.py Calculator Coverage Spike

This is a standalone Python experiment for checking whether `genshin.py`
calculator endpoints can provide better player-state coverage than the current
`hoyolab_profile.json` import and the experimental `hoyoapi` spike.

It is not part of the TypeScript app and must not be used by planner logic yet.

## Setup

```bash
python -m pip install -r experiments/genshin_py/requirements.txt
```

## Commands

```bash
python experiments/genshin_py/run_genshin_py_experiment.py --print-config
python experiments/genshin_py/run_genshin_py_experiment.py --json --no-write
python experiments/genshin_py/run_genshin_py_experiment.py --out data/raw/genshin_py/latest.sanitized.json --details --limit-characters 5
```

The script reads `.env.local`, `.env`, and process environment. It supports
`GENSHIN_UID`, `LTUID_V2`, `LTOKEN_V2`, `COOKIE_TOKEN_V2`, and the `HOYOAPI_*`
variants used by the hoyoapi spike.

Generated output under `data/raw/genshin_py/*.json` is ignored by git.
