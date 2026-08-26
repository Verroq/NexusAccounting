# /api/outposts/{outpostId}

Returns a single outpost with full resource state, buildings, garrison and orbital defense.

## Method

`GET`

## Response Structure

```json
{
  "outpost": {
    "id": 654,
    "userId": 428,
    "systemId": 6825,
    "asteroidFieldId": null,
    "localOrbit": 16,
    "name": "Outpost G45",
    "outpostType": "mining_outpost",
    "level": 2,
    "ore": 17959,
    "silicates": 19730,
    "hydrogen": 1454,
    "alloys": 0,
    "cryoIce": 0,
    "quantumDust": 0,
    "plasmaCore": 3082.1172,
    "bioExtract": 0,
    "darkMatter": 0,
    "basicStorage": 60000,
    "rareStorage": 8000,
    "oreRate": 0,
    "silicatesRate": 0,
    "hydrogenRate": 0,
    "cryoIceRate": 0,
    "quantumDustRate": 0,
    "plasmaCoreRate": 0,
    "darkMatterRate": 0,
    "shieldHp": 200,
    "shieldMaxHp": 200,
    "garrison": [],
    "hangarAssignments": null,
    "hp": 2000,
    "maxHp": 2000,
    "isConstructing": false,
    "constructionEndsAt": null,
    "constructionJobId": null,
    "constructionType": null,
    "pendingBuildingKey": null,
    "isRelocating": false,
    "isDrifting": true,
    "shieldReinforcedUntil": null,
    "lastRenamedAt": null,
    "resourcesUpdatedAt": "2026-08-09T18:18:34.713Z",
    "resourceRevision": 398,
    "productionRateVersion": 6,
    "createdAt": "2026-06-30T14:16:41.371Z",
    "buildings": [
      {
        "id": 2687,
        "outpostId": 654,
        "buildingKey": "storage",
        "level": 5
      }
    ],
    "asteroidField": null,
    "deployedShipCount": 0,
    "leadershipVessel": null,
    "orbitDefense": [],
    "totalOrbitDefense": {
      "total": 0,
      "damaged": 0
    },
    "systemX": 124.636856,
    "systemY": 97.79551
  },
  "resourceSnapshot": {
    "locationType": "outpost",
    "locationId": 654,
    "revision": 398,
    "serverNow": "2026-08-26T09:20:34.801Z",
    "resourcesUpdatedAt": "2026-08-09T18:18:34.713Z",
    "resources": {
      "ore": 17959,
      "silicates": 19730,
      "hydrogen": 1454,
      "alloys": 0,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 3082.1172,
      "bioExtract": 0,
      "darkMatter": 0,
      "antimatter": 0,
      "population": 0
    },
    "productionRates": {
      "ore": 0,
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
      "ore": 60000,
      "silicates": 60000,
      "hydrogen": 60000,
      "alloys": 60000,
      "rare": 8000,
      "population": 0
    },
    "energy": {
      "produced": 0,
      "consumed": 0
    },
    "productionBudget": 0,
    "productionMultiplier": 0,
    "starterProductionMultiplier": 1
  }
}
```

## Notes

- Item shape matches `outposts[]` in [outposts.md](./outposts.md).

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/outposts/{outpostId}` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `outpost.buildings`=4.
