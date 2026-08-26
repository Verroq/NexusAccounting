# /api/planets/{planetId}

Returns detailed information for a single planet including full resource state, production rates, storage, shield, and complete building definitions with upgrade costs.

## Method

`GET`

## Response Structure

```json
{
  "planet": {
    "id": 29925,
    "systemId": 577,
    "userId": 428,
    "name": "Terra",
    "renamedAt": "2026-06-06T00:49:19.764Z",
    "position": 4,
    "planetType": "terra",
    "size": 160,
    "temperature": 35,
    "ore": 294269.7,
    "silicates": 633778.9,
    "hydrogen": 242865.64,
    "alloys": 85973.18,
    "oreRate": 5226.258,
    "silicatesRate": 2694.3274,
    "hydrogenRate": 1306.26,
    "alloysRate": 870.84,
    "energyProduced": 4992.57,
    "energyConsumed": 4380,
    "population": 3519,
    "maxPopulation": 3519,
    "populationGrowthRate": 20.5821,
    "oreStorage": 1173300,
    "silicatesStorage": 1173300,
    "hydrogenStorage": 1173300,
    "alloysStorage": 1163300,
    "shieldHp": 0,
    "shieldMaxHp": 0,
    "shieldRegenRate": 0,
    "shieldLastUpdatedAt": "2026-06-04T10:15:52.205Z",
    "cryoIce": 6,
    "quantumDust": 0,
    "plasmaCore": 50,
    "bioExtract": 1853.2244,
    "darkMatter": 0,
    "antimatter": 0,
    "cryoIceRate": 0,
    "quantumDustRate": 0,
    "plasmaCoreRate": 0,
    "bioExtractRate": 1.9228215,
    "darkMatterRate": 0,
    "antimatterRate": 0,
    "rareResourceStorage": 110000,
    "computingPower": 0,
    "computingRequired": 0,
    "debrisOre": 0,
    "debrisSilicates": 0,
    "debrisAlloys": 0,
    "shieldReinforcedUntil": null,
    "shieldReinforcementCooldownUntil": null,
    "deadSpaceShieldSuppressedUntil": null,
    "resourcesUpdatedAt": "2026-08-26T09:19:51.096Z",
    "resourceRevision": 4065,
    "productionRateVersion": 6,
    "colonizedAt": "2026-06-06T00:41:29.508Z",
    "isHomeworld": true,
    "sortOrder": 0,
    "usedBuildingSlots": 14,
    "maxBuildingSlots": 16
  },
  "serverNow": "2026-08-26T09:19:51.417Z",
  "deadSpaceShieldEnabled": false,
  "resourceSnapshot": {
    "locationType": "planet",
    "locationId": 29925,
    "revision": 4065,
    "serverNow": "2026-08-26T09:19:51.417Z",
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
  "systemInfo": {
    "systemName": "A12-27",
    "systemX": -238.32376,
    "systemY": 636.6574,
    "starType": "orange",
    "securityZone": "sentinel",
    "armIndex": 0,
    "sectorIndex": 11
  },
  "productionBreakdown": {
    "breakdown": {
      "ore": {
        "base": 2924,
        "workers": 1.23,
        "consumption": 708,
        "research": 0.5499999999999998,
        "race": 0.1,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 5226,
        "gross": 5934.258,
        "effectiveConsumption": 708
      },
      "silicates": {
        "base": 1547,
        "workers": 1.23,
        "consumption": 236,
        "research": 0.44000000000000017,
        "race": 0.1,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 2694,
        "gross": 2930.3274,
        "effectiveConsumption": 236
      },
      "hydrogen": {
        "base": 708,
        "workers": 1.23,
        "consumption": 0,
        "research": 0.3999999999999999,
        "race": 0.1,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 1306,
        "gross": 1306.26,
        "effectiveConsumption": 0
      },
      "alloys": {
        "base": 472,
        "workers": 1.23,
        "consumption": 0,
        "research": 0.3999999999999999,
        "race": 0.1,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 870,
        "gross": 870.8399999999999,
        "effectiveConsumption": 0
      },
      "cryoIce": {
        "base": 0,
        "workers": 1,
        "consumption": 0,
        "research": 0.25,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 0,
        "gross": 0,
        "effectiveConsumption": 0
      },
      "quantumDust": {
        "base": 0,
        "workers": 1,
        "consumption": 0,
        "research": 0.6000000000000001,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 0,
        "gross": 0,
        "effectiveConsumption": 0
      },
      "plasmaCore": {
        "base": 0,
        "workers": 1,
        "consumption": 0,
        "research": 0.6000000000000001,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 0,
        "gross": 0,
        "effectiveConsumption": 0
      },
      "bioExtract": {
        "base": 37,
        "workers": 1,
        "consumption": 35,
        "research": 0,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 1,
        "gross": 37.11282148436949,
        "effectiveConsumption": 35.19
      },
      "darkMatter": {
        "base": 0,
        "workers": 1,
        "consumption": 0,
        "research": 0,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "energy": 1,
        "final": 0,
        "gross": 0,
        "effectiveConsumption": 0
      },
      "antimatter": {
        "base": 0,
        "workers": 1,
        "consumption": 0,
        "research": 0,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "zone": 0,
        "station": 0,
        "artifact": 1,
        "artifactFlat": 0,
        "energy": 1,
        "final": 0,
        "gross": 0,
        "effectiveConsumption": 0
      }
    },
    "population": {
      "base": 5,
      "buildings": 5.800000000000001,
      "research": 0.5125000000000002,
      "leadership": 0.2,
      "temperature": 0.05
    },
    "energyProducers": {
      "17967": {
        "rawBase": 902,
        "base": 1109,
        "final": 1775,
        "energyResearch": 0.44999999999999996,
        "solarResearch": 0.1499999999999999,
        "research": 0.5999999999999999,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "artifact": 1
      },
      "17987": {
        "rawBase": 1804,
        "base": 2218,
        "final": 3217,
        "energyResearch": 0.44999999999999996,
        "solarResearch": 0,
        "research": 0.44999999999999996,
        "race": 0,
        "planetType": 0,
        "temperature": 0,
        "artifact": 1
      }
    },
    "securityZone": "sentinel",
    "planetType": "terra",
    "race": "explorer"
  },
  "productionMultiplier": 1,
  "starterProductionMultiplier": 1,
  "buildSpeedMult": 0.37735849056603776,
  "buildQueueCount": 0,
  "buildQueueMax": 2,
  "buildings": [
    {
      "id": 17959,
      "level": 0,
      "powerLevel": 100,
      "isUpgrading": false,
      "upgradeStartedAt": null,
      "upgradeEndsAt": null,
      "damagePercent": 0,
      "pvpEconomicDamagedAt": null,
      "pvpEconomicLevelLossEligibleAt": null,
      "pvpEconomicRepairProtectsLevel": false,
      "factoryMode": null,
      "assignedWorkers": 0,
      "arkLocked": false,
      "pendingCount": 0,
      "previewBuildTimeSeconds": 190,
      "previewUpgradeCost": {
        "ore": 150,
        "silicates": 100,
        "hydrogen": 50,
        "alloys": 50
      },
      "demolishPreview": null,
      "definition": {
        "id": 26,
        "key": "defense_traps",
        "name": "Defense Traps",
        "description": "Hidden traps around key installations. Deals damage to raiding parties and slows their operations (+10s per level).",
        "category": "defense",
        "maxLevel": 10,
        "baseCostOre": 150,
        "baseCostSilicates": 100,
        "baseCostHydrogen": 50,
        "baseCostAlloys": 50,
        "costFactor": 1.5,
        "costDoubleAfter": 0,
        "highLevelFactor": 1.5,
        "alloysFromLevel": 1,
        "baseBuildTime": 500,
        "buildTimeFactor": 1.5,
        "energyPerLevel": -3,
        "productionPerLevel": 0,
        "productionResource": null,
        "storagePerLevel": 0,
        "storageResource": null,
        "populationPerLevel": 0,
        "populationGrowthPerLevel": 0,
        "consumptionResource": null,
        "consumptionPerLevel": 0,
        "consumptionResource2": null,
        "consumptionPerLevel2": 0,
        "raceRestriction": null,
        "requirements": [
          {
            "key": "basic_armor",
            "type": "research"
          }
        ],
        "requirementsMet": true,
        "disabledReason": null
      }
    }
  ]
}
```

## Notes

- `planet` contains live resource amounts, production rates per hour, storage caps, shield state, rare resources, and colony metadata.
- `resourceSnapshot` mirrors the resource totals and production rates with a revision counter for cache invalidation.
- `buildings` is the full list of buildings on the planet. Each entry has:
  - `previewUpgradeCost` — exact resource cost (ore/silicates/hydrogen/alloys) to upgrade to the next level, server-computed including all bonuses.
  - `previewBuildTimeSeconds` — upgrade duration in seconds, server-computed including all speed bonuses.
  - `isUpgrading`, `upgradeStartedAt`, `upgradeEndsAt` — active upgrade state.
  - `definition` — full static definition including base costs, cost scaling factors, energy/production/storage effects, and unmet requirements.
- `definition.requirementsMet` and `definition.disabledReason` reflect the player's current eligibility to upgrade.
- Previously the addon only consumed `buildings[].level`, `upgradeStartedAt`, `upgradeEndsAt`, and `definition.{key,name}`. The full schema confirmed here exposes significantly more.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/planets/29925` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `buildings`=37.
