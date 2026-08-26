# /api/research

Returns the full research catalogue for the authenticated player, including costs, effects, requirements, and current progress for every technology.

## Method

`GET`

## Response Structure

```json
{
  "research": [
    {
      "id": 124,
      "key": "basic_computing",
      "name": "Basic Computing",
      "description": "Parallel processing algorithms accelerate research calculations.",
      "era": 1,
      "branch": "science",
      "category": "computing",
      "costOre": 200,
      "costSilicates": 300,
      "costHydrogen": 0,
      "costAlloys": 0,
      "rareCosts": {},
      "researchTime": 300,
      "timeFactor": 3,
      "maxLevel": 5,
      "costFactor": 3,
      "requiredLabLevel": 1,
      "requirements": [],
      "effects": [
        {
          "type": "research_speed_bonus",
          "value": 0.03
        }
      ],
      "sortOrder": 1,
      "status": "completed",
      "startsAt": "2026-07-02T14:13:53.843Z",
      "endsAt": "2026-07-02T22:05:55.843Z",
      "completedAt": "2026-07-02T22:05:55.878Z",
      "planetId": 29925,
      "jobId": null,
      "pauseReason": null,
      "eraUnlocked": true,
      "level": 5,
      "isMaxed": true,
      "nextCostOre": 0,
      "nextCostSilicates": 0,
      "nextCostHydrogen": 0,
      "nextCostAlloys": 0,
      "nextRareCosts": {},
      "nextResearchTime": 0
    }
  ],
  "researchSpeedMult": 0.5865102639296187,
  "precursorFragmentEffectBonus": 0,
  "precursorFragmentEffectMultiplierBonus": 0,
  "activeResearch": {
    "id": 64,
    "key": "plasma_weapons",
    "name": "Plasma Weapons",
    "status": "in_progress",
    "pauseReason": null,
    "startsAt": "2026-08-25T06:42:36.056Z",
    "endsAt": "2026-08-27T06:13:03.056Z",
    "planetId": 29925,
    "planetName": "Terra"
  },
  "activeResearches": [
    {
      "id": 64,
      "key": "plasma_weapons",
      "name": "Plasma Weapons",
      "status": "in_progress",
      "pauseReason": null,
      "startsAt": "2026-08-25T06:42:36.056Z",
      "endsAt": "2026-08-27T06:13:03.056Z",
      "planetId": 29925,
      "planetName": "Terra"
    }
  ]
}
```

## Notes

- Returns **all** technologies, not just the active queue. Each entry represents the player's state for that technology.
- `status` values observed: `"completed"`, `"in_progress"`, `"available"`, `"locked"`.
- `costOre/Silicates/Hydrogen/Alloys` and `researchTime` are the base values for level 1.
- `costFactor` and `timeFactor` are the exponential scaling multipliers applied per level.
- `nextCostOre/Silicates/Hydrogen/Alloys` and `nextResearchTime` are the **server-computed** cost and duration for the player's next upgrade — these account for current level and any active bonuses.
- `nextRareCosts` is an object keyed by rare resource name (e.g. `{"cryoIce": 100}`); empty `{}` when no rare cost applies.
- `rareCosts` follows the same shape for the base cost.
- `effects` describes what each level unlocks or modifies. Known effect types include `ship_hp_bonus`, `building_hp_bonus`, `research_speed_bonus`, `unlock_building`.
- `requiredLabLevel` is the minimum Research Lab level required to start this technology.
- `isMaxed` is `true` when `level === maxLevel`; in that case all `nextCost*` fields are `0`.
- `eraUnlocked` reflects whether the tech's era prerequisite is met for the player.
- The addon accepts either `data.research` (object wrapper) or a bare array as the response root.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/research?planetId=29925` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `activeResearches`=3, `research`=131.
