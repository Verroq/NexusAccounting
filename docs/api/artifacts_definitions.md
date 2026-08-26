# /api/artifacts/definitions

Returns the static catalogue of every artifact definition in the game. The top level is a bare array.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 1,
    "key": "rusty_ore_extractor",
    "name": "Rusty Ore Extractor",
    "description": "A battered mining module that still manages to squeeze out extra ore.",
    "tier": "common",
    "scope": "planet",
    "effectType": "ore_production_bonus",
    "effectValue": 0.05,
    "effectResource": "ore",
    "activationCostOre": 500,
    "activationCostSilicates": 300,
    "activationCostHydrogen": 0,
    "activationCostAlloys": 0,
    "activationCostEnergy": 0,
    "activationTime": 1800,
    "duration": 86400
  }
]
```

## Notes

- Static per universe; cache it rather than refetching. `/api/artifacts` already inlines the matching definition per owned artifact, so this is mainly useful for showing artifacts the player does not own yet.
- `effectType` + `effectValue` (+ `effectResource` where relevant) describe the bonus; `activationCost*`, `activationTime` and `duration` describe the cost of running it.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/artifacts/definitions` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `(root)`=95.
