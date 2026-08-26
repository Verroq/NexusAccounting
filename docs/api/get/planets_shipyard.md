# /api/planets/{planetId}/shipyard

Returns the full ship catalogue for the given planet's shipyard, including build costs, combat stats, requirements, and current availability.

## Method

`GET`

## Response Structure

```json
{
  "ships": [
    {
      "id": 1,
      "key": "probe",
      "name": "Probe",
      "description": "Unmanned recon drone. Fastest ship, minimal spy power. Fragile \u2014 rapid-fire target for fighters.",
      "shipClass": "recon",
      "costOre": 40,
      "costSilicates": 198,
      "costHydrogen": 0,
      "costAlloys": 0,
      "rareCosts": {},
      "buildTime": 38,
      "hp": 30,
      "shieldHp": 8,
      "attack": 0,
      "speed": 30,
      "cargoCapacity": 0,
      "miningCargoCapacity": 0,
      "hangarCapacity": 0,
      "requiredShipyardLevel": 1,
      "requirements": [
        {
          "key": "probe_technology",
          "type": "research"
        }
      ],
      "fuelRate": 0.5,
      "shipSize": "small",
      "weaponType": null,
      "armorType": "light",
      "sortOrder": 1,
      "populationCost": 0,
      "populationCargoCapacity": 0,
      "allowedCargo": null,
      "effectiveSpeed": 55,
      "available": true,
      "researchMet": true,
      "shipyardMet": true,
      "currentShipyardLevel": 6,
      "shipyardName": "Planetary Shipyard",
      "requirementNames": [
        "Probe Technology"
      ],
      "effectiveHp": 39,
      "effectiveShieldHp": 12,
      "effectiveAttack": 0,
      "effectiveCargoCapacity": 0,
      "effectiveMiningCargoCapacity": 0,
      "repairCostPerUnit": {
        "ore": 20,
        "silicates": 99,
        "hydrogen": 0,
        "alloys": 0
      }
    }
  ],
  "shipSpeedMult": 0.5161290322580645,
  "orbitalShipSpeedMult": 0.5925925925925926,
  "shipScrapSpeedMult": 0.5161290322580645,
  "orbitalShipScrapSpeedMult": 0.5925925925925926,
  "planetaryQueue": null,
  "orbitalQueue": null,
  "planetaryQueueAll": [],
  "orbitalQueueAll": [],
  "planetaryQueueCount": 0,
  "orbitalQueueCount": 0,
  "maxQueueSize": 1
}
```

## Notes

- Returns **all** ship types in the game, not just buildable ones. Use `available` to determine which can currently be built at this planet.
- `available` is `true` only when both `researchMet` and `shipyardMet` are `true`.
- `researchMet` — all research requirements in `requirements` are completed.
- `shipyardMet` — `currentShipyardLevel >= requiredShipyardLevel`.
- `currentShipyardLevel` reflects the actual shipyard level on this planet; `shipyardName` identifies the building type (e.g. `"Planetary Shipyard"`, `"Orbital Dock"`).
- `costOre/Silicates/Hydrogen/Alloys` — per-unit build cost in base resources.
- `rareCosts` — per-unit rare resource cost as a keyed object (e.g. `{"cryoIce": 10}`); empty `{}` when none apply.
- `buildTime` — build time in seconds per unit.
- `repairCostPerUnit` — cost to repair one damaged unit back to full health (approximately 50% of build cost).
- `effectiveSpeed` — speed after applying research bonuses, used for travel time calculations.
- `allowedCargo` — restricts which resource types this ship can carry; `null` means unrestricted.
- `populationCost` — population consumed per unit when built (relevant for capital ships).
- `hangarCapacity` — number of smaller ships this ship can carry in its hangar.
- This endpoint was not previously documented in the addon and was discovered via live network observation.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/planets/29925/shipyard` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `ships`=31.
