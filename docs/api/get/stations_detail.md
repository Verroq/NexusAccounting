# /api/stations/{stationId}

Returns a single station with resource state, shields, turrets, garrison and capture state.

## Method

`GET`

## Response Structure

```json
{
  "station": {
    "id": 20,
    "sectorId": 47,
    "systemId": 2345,
    "name": "Station Epsilon",
    "ownerAllianceId": 48,
    "capturedByUserId": 11000,
    "capturedAt": "2026-08-13T21:51:16.724Z",
    "capturingAllianceId": null,
    "capturingUserId": null,
    "captureEndsAt": null,
    "captureJobId": null,
    "shieldHp": 2000,
    "shieldMaxHp": 2000,
    "turretHp": 0,
    "turretMaxHp": 0,
    "ore": 0.85546875,
    "silicates": 0.68359375,
    "hydrogen": 0.421875,
    "alloys": 0,
    "basicStorage": 100000,
    "rareStorage": 10000,
    "cryoIce": 0.5698242,
    "quantumDust": 0.39013672,
    "plasmaCore": 0.46600342,
    "bioExtract": 0,
    "darkMatter": 0.070007324,
    "antimatter": 0,
    "resourceRevision": 573,
    "garrison": [],
    "shieldReinforcedUntil": null,
    "captureProtectedUntil": "2026-08-14T16:00:00.000Z",
    "withdrawAccessRole": "member",
    "createdAt": "2026-05-02T23:14:19.618Z",
    "buildings": [
      {
        "id": 61,
        "stationId": 20,
        "buildingKey": "dock",
        "level": 0,
        "isUpgrading": false,
        "upgradeEndsAt": null,
        "upgradeJobId": null
      }
    ],
    "ownerAlliance": {
      "id": 48,
      "name": "DAMOCLES",
      "tag": "SWORD"
    },
    "capturingAlliance": null,
    "sector": {
      "id": 47,
      "index": 46,
      "armId": 1,
      "securityZone": "dead",
      "name": "Alpha Arm - Sector 47"
    },
    "system": {
      "id": 2345,
      "name": "A47-45",
      "x": 99.20541,
      "y": -51.43165
    },
    "captureReworkEnabled": true,
    "myGarrison": [],
    "allianceGarrison": [],
    "totalGarrison": {
      "total": 0,
      "damaged": 0
    },
    "myOrbitDefense": [],
    "allianceOrbitDefense": [],
    "totalOrbitDefense": {
      "total": 0,
      "damaged": 0
    },
    "activeCaptureOperation": null,
    "captureInitiation": {
      "minimumCommandPoints": 500,
      "blockedUntil": "2026-08-17T21:57:18.849Z",
      "hasRequiredRole": false
    },
    "withdrawalAccess": {
      "canWithdraw": true,
      "canManage": false
    },
    "vulnerabilityWindow": {
      "configured": true,
      "usesDefault": false,
      "isOpen": false,
      "startMinute": 1020,
      "start": null,
      "end": null,
      "nextStart": "2026-08-26T16:00:00.000Z",
      "nextEnd": "2026-08-26T20:00:00.000Z"
    }
  },
  "resourceSnapshot": {
    "locationType": "station",
    "locationId": 20,
    "revision": 573,
    "serverNow": "2026-08-26T09:20:35.138Z",
    "resourcesUpdatedAt": "2026-08-26T09:20:35.138Z",
    "resources": {
      "ore": 0.85546875,
      "silicates": 0.68359375,
      "hydrogen": 0.421875,
      "alloys": 0,
      "cryoIce": 0.5698242,
      "quantumDust": 0.39013672,
      "plasmaCore": 0.46600342,
      "bioExtract": 0,
      "darkMatter": 0.070007324,
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
      "ore": 100000,
      "silicates": 100000,
      "hydrogen": 100000,
      "alloys": 100000,
      "rare": 10000,
      "population": 0
    },
    "energy": {
      "produced": 0,
      "consumed": 0
    }
  }
}
```

## Notes

- Item shape matches `stations[]` in [stations_sector.md](./stations_sector.md).

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/stations/{stationId}` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `station.buildings`=4.
