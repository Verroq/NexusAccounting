# /api/planets/{planetId}/fleet

Fetches the currently stationed fleet at the specified planet, along with detailed ship definitions.

## Payload Structure

```json
{
  "fleet": [
    {
      "id": 334873,
      "planetId": 29925,
      "shipDefId": 1,
      "quantity": 12,
      "damagedQuantity": 0,
      "definition": {
        "id": 1,
        "key": "probe",
        "name": "Probe",
        "description": "Unmanned recon drone. Fastest ship, minimal spy power. Fragile \u2014 rapid-fire target for fighters.",
        "shipClass": "recon",
        "costOre": 50,
        "costSilicates": 250,
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
        "effectiveHp": 39,
        "effectiveShieldHp": 12,
        "effectiveAttack": 0,
        "effectiveCargoCapacity": 0,
        "effectiveMiningCargoCapacity": 0
      }
    }
  ],
  "cargoBonus": 0.5,
  "shuttleCargoBonus": 0.6000000000000001,
  "resourceSnapshot": {
    "locationType": "planet",
    "locationId": 29925,
    "revision": 4065,
    "serverNow": "2026-08-26T09:19:51.115Z",
    "resourcesUpdatedAt": "2026-08-26T09:19:51.096Z",
    "resources": {
      "ore": 294269.7,
      "silicates": 633778.9,
      "hydrogen": 242865.64,
      "alloys": 85973.18,
      "cryoIce": 6,
      "quantumDust": 0,
      "plasmaCore": 50,
      "bioExtract": 1853.2244,
      "darkMatter": 0,
      "antimatter": 0,
      "population": 3519
    },
    "productionRates": {
      "ore": 5226.258,
      "silicates": 2694.3274,
      "hydrogen": 1306.26,
      "alloys": 870.84,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 0,
      "bioExtract": 1.9228215,
      "darkMatter": 0,
      "antimatter": 0,
      "populationGrowth": 20.5821
    },
    "storage": {
      "ore": 1173300,
      "silicates": 1173300,
      "hydrogen": 1173300,
      "alloys": 1163300,
      "rare": 110000,
      "population": 3519
    },
    "energy": {
      "produced": 4992.57,
      "consumed": 4380
    },
    "productionRateVersion": 6,
    "productionMultiplier": 1,
    "starterProductionMultiplier": 1
  },
  "resources": {
    "ore": 294269.7,
    "silicates": 633778.9,
    "hydrogen": 242865.64,
    "alloys": 85973.18,
    "cryo_ice": 6,
    "quantum_dust": 0,
    "plasma_core": 50,
    "bio_extract": 1853.2244,
    "dark_matter": 0,
    "antimatter": 0
  }
}
```

### Important Notes
- `fleet`: Array of available ships.
- `quantity`: Amount of ships available (not deployed on missions).
- `definition.cargoCapacity`: Base cargo capacity. Effective cargo capacity can be modified by `cargoBonus`.
- `definition.fuelRate`: The fuel consumed per unit distance.
- `definition.allowedCargo`: Restricts what resources the ship can carry. Null means it can carry any resource type.
- **Ship Keys**: Note that the Spy Probe is identified by the key `"spy_probe"`.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/planets/29925/fleet` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `fleet`=6.
