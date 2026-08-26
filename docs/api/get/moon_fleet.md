# /api/moons/{moonId}/fleet

Returns moon fleet stationed on a moon when access is allowed.

## Method

`GET`

## Response Structure

```json
{
  "fleet": [
    {
      "id": 143113,
      "moonId": 125918,
      "shipDefId": 24,
      "quantity": 239,
      "damagedQuantity": 0,
      "hangarAssignments": null,
      "definition": {
        "id": 24,
        "key": "bulk_carrier",
        "name": "Bulk Carrier",
        "description": "Massive cargo hauler (3000 capacity). Slow but enormous capacity for large-scale transport.",
        "shipClass": "utility",
        "costOre": 1500,
        "costSilicates": 800,
        "costHydrogen": 400,
        "costAlloys": 200,
        "rareCosts": {
          "cryo_ice": 50
        },
        "buildTime": 450,
        "hp": 400,
        "shieldHp": 100,
        "attack": 0,
        "speed": 4,
        "cargoCapacity": 3000,
        "miningCargoCapacity": 0,
        "hangarCapacity": 0,
        "requiredShipyardLevel": 1,
        "requirements": [
          {
            "key": "cargo_expansion",
            "type": "research"
          }
        ],
        "fuelRate": 3,
        "shipSize": "large",
        "weaponType": null,
        "armorType": "medium",
        "sortOrder": 22,
        "populationCost": 5,
        "populationCargoCapacity": 0,
        "allowedCargo": null,
        "effectiveHp": 520,
        "effectiveShieldHp": 150,
        "effectiveAttack": 0,
        "effectiveCargoCapacity": 4500,
        "effectiveMiningCargoCapacity": 0
      }
    }
  ]
}
```

## Notes

- Live probe on `s0` returned `403` (`error`, `code`) for a moon not owned by the current user.
- Access is ownership/permission dependent.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/moons/125918/fleet` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `fleet[].definition.requirements`=2.
