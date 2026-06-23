# genshin.py Spike

This spike evaluates whether `genshin.py` calculator endpoints can provide
richer player-state data than the current `hoyolab_profile.json` flow and the
failed `hoyoapi` game-record experiment.

It is experimental only. It is not integrated into the TypeScript player-state
pipeline, planner, LLM tools, or resin optimizer.

## Setup

```bash
python -m pip install -r experiments/genshin_py/requirements.txt
```

Pinned experiment dependencies:

- `genshin==1.7.27`
- `python-dotenv==1.2.1`
- `pytest==9.0.2`

## Environment

Credentials are read from `.env.local`, `.env`, and process environment.
Supported names:

- `GENSHIN_UID`
- `LTUID_V2`
- `LTOKEN_V2`
- `COOKIE_TOKEN_V2`
- `HOYOAPI_UID`
- `HOYOAPI_LTUID_V2`
- `HOYOAPI_LTOKEN_V2`
- `HOYOAPI_COOKIE_TOKEN_V2`
- `HOYOAPI_COOKIE`

If `HOYOAPI_COOKIE` exists, the script parses it into a cookie dictionary when
practical. Token and cookie values are never printed.

## Commands

```bash
python experiments/genshin_py/run_genshin_py_experiment.py --print-config
python experiments/genshin_py/run_genshin_py_experiment.py --json --no-write
python experiments/genshin_py/run_genshin_py_experiment.py --out data/raw/genshin_py/latest.sanitized.json --details --limit-characters 5
```

Optional flags:

- `--lang en`
- `--uid <uid>`
- `--limit-characters 5`
- `--details`
- `--daily-notes`
- `--no-write`
- `--json`

The script does not call state-changing endpoints, does not claim daily rewards,
and does not redeem codes.

## Endpoints Tested

- `Client(cookies, uid=uid)`
- `get_game_accounts`
- `get_calculator_characters(uid=uid, lang=lang, sync=True)`
- `get_calculator_weapons(lang=lang)`
- `get_calculator_artifacts(lang=lang)`
- `get_character_details(character, uid=uid, lang=lang)` for selected
  characters when `--details` is used
- `get_genshin_notes` when `--daily-notes` is used

## Coverage Report

The recursive detector reports character level, ascension, rarity,
constellation, talents, talent types, equipped weapon, weapon level/refinement,
equipped artifacts, artifact set/slot/level/rarity/main stat/substats, and
resin when daily notes are tested.

Verdicts:

- `genshin.py is better than current hoyolab_profile importer`
- `genshin.py is equivalent`
- `genshin.py is worse/incomplete`
- `inconclusive due to auth/API errors`

## Security

Do not commit `.env`, `.env.local`, or any raw private output. Sanitized output
is written only when `--out` is provided, and `data/raw/genshin_py/*.json` is
ignored by git.

## Promotion Criteria

`genshin.py` can become a real provider only if it reliably returns:

- character list;
- character levels;
- constellation;
- talent levels;
- equipped weapon;
- enough artifact details to be useful;
- stable response shape or manageable normalization.
