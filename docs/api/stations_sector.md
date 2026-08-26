# /api/stations/sector/{sectorId}

Returns all stations in a sector, including storage, ownership, garrison, and buildings.

## Method

`GET`

## Response Structure

```json
{
  "stations": [
    {
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
      "system": {
        "id": 2345,
        "name": "A47-45",
        "x": 99.20541,
        "y": -51.43165
      },
      "totalGarrison": {
        "total": 0,
        "damaged": 0
      }
    }
  ]
}
```

## Notes

- Confirmed from the `Station` model and both the background sync and interception logic.
- This endpoint combines economic, tactical, and ownership state in one response.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/stations/sector/47` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `stations`=5, `stations[].buildings`=4.
