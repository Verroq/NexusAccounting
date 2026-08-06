# /api/planets/{planetId}

Returns detailed information for a single planet including full resource state, production rates, storage, shield, and complete building definitions with upgrade costs.

## Method

`GET`

## Response Structure

```json
{
  "planet": {
    "id": 35332,
    "systemId": 19,
    "userId": 9696,
    "name": "Beta",
    "renamedAt": "2026-06-25T11:59:51.104Z",
    "position": 3,
    "planetType": "crystalline",
    "size": 239,
    "temperature": 98,
    "ore": 14236.197,
    "silicates": 14758.97,
    "hydrogen": 8948.109,
    "alloys": 4386.3423,
    "oreRate": 3669.406,
    "silicatesRate": 3286.519,
    "hydrogenRate": 1180.59,
    "alloysRate": 803.344,
    "energyProduced": 4102.6826,
    "energyConsumed": 3921,
    "population": 2620,
    "maxPopulation": 2620,
    "populationGrowthRate": 24.298313,
    "oreStorage": 415975,
    "silicatesStorage": 415975,
    "hydrogenStorage": 415975,
    "alloysStorage": 404475,
    "shieldHp": 0,
    "shieldMaxHp": 0,
    "shieldRegenRate": 0,
    "shieldLastUpdatedAt": "2026-06-04T16:27:26.903Z",
    "cryoIce": 4786,
    "quantumDust": 0,
    "plasmaCore": 3211,
    "bioExtract": 48.574673,
    "darkMatter": 0,
    "antimatter": 0,
    "cryoIceRate": 0,
    "quantumDustRate": 0,
    "plasmaCoreRate": 0,
    "bioExtractRate": 0.35654333,
    "darkMatterRate": 0,
    "antimatterRate": 0,
    "rareResourceStorage": 20000,
    "computingPower": 0,
    "computingRequired": 0,
    "debrisOre": 0,
    "debrisSilicates": 0,
    "debrisAlloys": 0,
    "shieldReinforcedUntil": null,
    "shieldReinforcementCooldownUntil": null,
    "resourcesUpdatedAt": "2026-07-17T09:45:06.020Z",
    "resourceRevision": 1308,
    "colonizedAt": "2026-06-25T10:50:00.326Z",
    "isHomeworld": false,
    "usedBuildingSlots": 16,
    "maxBuildingSlots": 23
  },
  "serverNow": "2026-07-17T09:45:06.036Z",
  "resourceSnapshot": {
    "locationType": "planet",
    "locationId": 35332,
    "revision": 1308,
    "serverNow": "2026-07-17T09:45:06.036Z",
    "resourcesUpdatedAt": "2026-07-17T09:45:06.020Z",
    "resources": {
      "ore": 14236.197,
      "silicates": 14758.97,
      "hydrogen": 8948.109,
      "alloys": 4386.3423,
      "cryoIce": 4786,
      "quantumDust": 0,
      "plasmaCore": 3211,
      "bioExtract": 48.574673,
      "darkMatter": 0,
      "antimatter": 0,
      "population": 2620
    },
    "productionRates": {
      "ore": 3669.406,
      "silicates": 3286.519,
      "hydrogen": 1180.59,
      "alloys": 803.344,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 0,
      "bioExtract": 0.35654333,
      "darkMatter": 0,
      "antimatter": 0
    }
  },
  "buildings": [
    {
      "id": 574874,
      "level": 4,
      "powerLevel": 100,
      "isUpgrading": false,
      "upgradeStartedAt": null,
      "upgradeEndsAt": null,
      "damagePercent": 0,
      "pvpEconomicDamagedAt": null,
      "factoryMode": null,
      "assignedWorkers": 0,
      "arkLocked": false,
      "pendingCount": 0,
      "previewBuildTimeSeconds": 1957,
      "previewUpgradeCost": {
        "ore": 1518,
        "silicates": 759,
        "hydrogen": 253,
        "alloys": 253
      },
      "definition": {
        "id": 19,
        "key": "construction_yard",
        "name": "Construction Yard",
        "description": "Automated construction facility. Reduces building upgrade time by 5% per level.",
        "category": "utility",
        "maxLevel": 15,
        "baseCostOre": 300,
        "baseCostSilicates": 150,
        "baseCostHydrogen": 50,
        "baseCostAlloys": 50,
        "costFactor": 1.5,
        "costDoubleAfter": 0,
        "highLevelFactor": 1.5,
        "alloysFromLevel": 1,
        "baseBuildTime": 785,
        "buildTimeFactor": 1.5,
        "energyPerLevel": -20,
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
        "requirements": [],
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