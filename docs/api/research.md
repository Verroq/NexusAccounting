# /api/research

Returns the full research catalogue for the authenticated player, including costs, effects, requirements, and current progress for every technology.

## Method

`GET`

## Response Structure

```json
{
  "research": [
    {
      "id": 75,
      "key": "basic_armor",
      "name": "Basic Armor Plating",
      "description": "Reinforced hull plating and structural reinforcement. Improves ship and defense durability.",
      "era": 1,
      "branch": "military",
      "category": "defense",
      "costOre": 300,
      "costSilicates": 150,
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
        { "type": "ship_hp_bonus", "value": 0.02 },
        { "type": "building_hp_bonus", "value": 0.05 },
        { "type": "unlock_building", "buildingKey": "defense_traps" }
      ],
      "sortOrder": 1,
      "status": "completed",
      "startsAt": "2026-07-11T14:17:20.250Z",
      "endsAt": "2026-07-11T15:07:35.250Z",
      "completedAt": "2026-07-11T15:07:35.280Z",
      "planetId": 35332,
      "jobId": null,
      "pauseReason": null,
      "eraUnlocked": true,
      "level": 3,
      "isMaxed": false,
      "nextCostOre": 8100,
      "nextCostSilicates": 4050,
      "nextCostHydrogen": 0,
      "nextCostAlloys": 0,
      "nextRareCosts": {},
      "nextResearchTime": 12150
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