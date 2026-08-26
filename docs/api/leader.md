# /api/leader

Returns the account-level leader archetype, the bonuses it currently grants, and diplomat doctrine state.

## Method

`GET`

## Response Structure

```json
{
  "leaderType": "explorer",
  "activeBonuses": {
    "expeditionLootBonus": 0.25,
    "surveyLootBonus": 0.15,
    "wormholeLootBonus": 0.2,
    "artifactDropBonus": 0.25,
    "shipSpeedBonus": 0.1,
    "fuelCostBonus": 0.15,
    "cargoBonus": 0.1,
    "oreProductionBonus": 0.1,
    "silicateProductionBonus": 0.1,
    "hydrogenProductionBonus": 0.1,
    "alloysProductionBonus": 0.1,
    "popGrowthBonus": 0.2,
    "workforceProductionBonus": 0.03
  },
  "diplomatDoctrine": null,
  "pendingDoctrine": null,
  "doctrineActiveAt": null,
  "canSwitchAt": null
}
```

## Notes

- `activeBonuses` is the same object as `user.activeLeaderBonuses` in [auth_me.md](./auth_me.md); its key set depends on `leaderType`.
- `diplomatDoctrine` / `pendingDoctrine` / `doctrineActiveAt` are only meaningful for the diplomat leader type. `canSwitchAt` is the cooldown before another doctrine switch is allowed.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/leader` -> `200`.
- Example above is a real response with every array truncated to its first item.
