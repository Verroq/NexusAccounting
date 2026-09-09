# /api/galaxy/station-index

Every station in the galaxy, one row each: where it is, who owns it and who (if anyone) is
capturing it. Cheap enough to use as the capture-state source for a whole alliance's stations.

## Method

`GET`

## Response Structure

```json
{
  "stations": [
    {
      "stationId": 117,
      "stationName": "Station Beta",
      "systemId": 15,
      "systemName": "A1-15",
      "systemX": 871.33295,
      "systemY": 397.7373,
      "ownedByViewerAlliance": false,
      "ownerAllianceTag": null,
      "capturingAllianceTag": null
    }
  ]
}
```

## Notes

- `systemName` is the station's coordinate string, `${sectorCode}-${slot}` with slot in
  5 / 15 / 25 / 35 / 45 — five stations per sector.
- `capturingAllianceTag` is the only capture signal available without a per-station fetch.

## Live Verification

- Verified 2026-09-09 on `s0`: `GET /api/galaxy/station-index` -> `200`.
