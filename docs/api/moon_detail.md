# /api/moons/{moonId}

Returns moon detail including building and queue data.

## Method

`GET`

## Response Structure

```json
{
  "moon": {
    "id": 125918,
    "planetId": 89639,
    "systemId": 4692,
    "userId": 428,
    "name": "Negi's Mom Nipple Clamp-a",
    "moonType": "metallic",
    "size": 36,
    "position": 1,
    "buildingSlots": 6,
    "ore": 63618.55,
    "silicates": 28892.09,
    "hydrogen": 34500,
    "alloys": 9651.224,
    "oreRate": 52.39,
    "silicatesRate": 0,
    "hydrogenRate": 0,
    "alloysRate": 0,
    "cryoIce": 0,
    "quantumDust": 0,
    "plasmaCore": 0,
    "bioExtract": 0,
    "darkMatter": 0,
    "antimatter": 0,
    "cryoIceRate": 0,
    "quantumDustRate": 0,
    "plasmaCoreRate": 0,
    "bioExtractRate": 0,
    "darkMatterRate": 0,
    "antimatterRate": 0,
    "rareResourceStorage": 62500,
    "energyProduced": 96,
    "energyConsumed": 68,
    "storage": 900000,
    "resourcesUpdatedAt": "2026-08-26T09:20:33.411Z",
    "resourceRevision": 43,
    "productionRateVersion": 6,
    "colonizedAt": "2026-08-12T21:21:11.166Z",
    "createdAt": "2026-06-08T21:15:01.564Z",
    "lastFleetScanAt": null,
    "lastWormholeScanAt": null,
    "lastActivityScanAt": null,
    "lastSpySweepAt": null,
    "lastJumpAt": null,
    "systemX": 84.37787,
    "systemY": 84.56233
  },
  "buildings": [
    {
      "id": 10742,
      "moonId": 125918,
      "buildingDefId": 39,
      "level": 1,
      "isUpgrading": false,
      "upgradeEndsAt": null,
      "key": "regolith_extractor",
      "name": "Regolith Extractor",
      "description": "Extracts ore and trace minerals from lunar regolith.",
      "category": "resource",
      "baseCostOre": 80,
      "baseCostSilicates": 30,
      "baseCostHydrogen": 0,
      "baseCostAlloys": 20,
      "costFactor": 1.4,
      "baseBuildTime": 185,
      "buildTimeFactor": 1.4,
      "energyPerLevel": -8,
      "productionPerLevel": 25,
      "productionResource": "ore",
      "consumptionResource": null,
      "consumptionPerLevel": 0,
      "consumptionResource2": null,
      "consumptionPerLevel2": 0,
      "maxLevel": 20,
      "costDoubleAfter": 0,
      "highLevelFactor": 1.5,
      "powerLevel": 100,
      "productionBreakdown": {
        "resourceRates": {
          "ore": 52.39,
          "silicates": 0,
          "hydrogen": 0,
          "alloys": 0
        },
        "energyRate": -8
      }
    }
  ],
  "queue": [],
  "allMoonDefs": [
    {
      "id": 44,
      "key": "jump_gate",
      "name": "Jump Gate",
      "description": "Enables instant fleet transfer between your moons with Jump Gates.",
      "category": "utility",
      "baseCostOre": 50000,
      "baseCostSilicates": 30000,
      "baseCostHydrogen": 40000,
      "baseCostAlloys": 80000,
      "costFactor": 1.6,
      "costDoubleAfter": 0,
      "highLevelFactor": 1.5,
      "alloysFromLevel": 1,
      "baseBuildTime": 86400,
      "buildTimeFactor": 1.6,
      "energyPerLevel": -30,
      "productionPerLevel": 0,
      "productionResource": null,
      "storagePerLevel": 0,
      "storageResource": null,
      "populationPerLevel": 0,
      "populationGrowthPerLevel": 0,
      "maxLevel": 1,
      "requirements": [
        {
          "key": "jump_drive",
          "type": "research"
        }
      ],
      "consumptionResource": null,
      "consumptionPerLevel": 0,
      "consumptionResource2": null,
      "consumptionPerLevel2": 0,
      "raceRestriction": null,
      "allowedOn": "moon"
    }
  ],
  "parentPlanetResources": {
    "id": 89639,
    "name": "Negi's Mom Nipple Clamp",
    "planetType": "rocky"
  },
  "userMoons": [
    {
      "id": 125918,
      "name": "Negi's Mom Nipple Clamp-a",
      "moonType": "metallic"
    }
  ],
  "jumpCooldownMs": null,
  "securityZone": "dead",
  "serverNow": "2026-08-26T09:20:33.424Z",
  "resourceSnapshot": {
    "locationType": "moon",
    "locationId": 125918,
    "revision": 43,
    "serverNow": "2026-08-26T09:20:33.424Z",
    "resourcesUpdatedAt": "2026-08-26T09:20:33.411Z",
    "resources": {
      "ore": 63618.55,
      "silicates": 28892.09,
      "hydrogen": 34500,
      "alloys": 9651.224,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 0,
      "bioExtract": 0,
      "darkMatter": 0,
      "antimatter": 0,
      "population": 0
    },
    "productionRates": {
      "ore": 52.39,
      "silicates": 0,
      "hydrogen": 0,
      "alloys": 0,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 0,
      "bioExtract": 0,
      "darkMatter": 0,
      "antimatter": 0,
      "populationGrowth": 0
    },
    "storage": {
      "ore": 900000,
      "silicates": 900000,
      "hydrogen": 900000,
      "alloys": 900000,
      "rare": 62500,
      "population": 0
    },
    "energy": {
      "produced": 96,
      "consumed": 68
    },
    "productionRateVersion": 6,
    "productionMultiplier": 1,
    "starterProductionMultiplier": 1
  }
}
```

## Notes


## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/moons/125918` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `allMoonDefs`=11, `buildings`=5, `userMoons`=2.
