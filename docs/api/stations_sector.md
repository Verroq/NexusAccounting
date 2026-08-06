# /api/stations/sector/{sectorId}

Returns all stations in a sector, including storage, ownership, garrison, and buildings.

## Method

`GET`

## Response Structure

```json
{
  "stations": [
    {
      "id": 901,
      "sectorId": 21,
      "systemId": 5752,
      "name": "Relay Station",
      "ownerAllianceId": null,
      "capturedByUserId": null,
      "capturedAt": null,
      "capturingAllianceId": null,
      "capturingUserId": null,
      "captureEndsAt": null,
      "captureJobId": null,
      "shieldHp": 5000,
      "shieldMaxHp": 5000,
      "ore": 10000,
      "silicates": 10000,
      "hydrogen": 5000,
      "alloys": 2000,
      "basicStorage": 25000,
      "rareStorage": 5000,
      "cryoIce": 0,
      "quantumDust": 0,
      "plasmaCore": 0,
      "bioExtract": 0,
      "darkMatter": 0,
      "antimatter": 0,
      "garrison": [],
      "shieldReinforcedUntil": null,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "buildings": [],
      "ownerAlliance": null,
      "capturingAlliance": null,
      "system": {
        "id": 5752,
        "name": "G21-52",
        "x": 345.12,
        "y": -519.7
      }
    }
  ]
}
```

## Notes

- Confirmed from the `Station` model and both the background sync and interception logic.
- This endpoint combines economic, tactical, and ownership state in one response.