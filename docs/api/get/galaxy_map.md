# /api/galaxy/map

Returns the visible galaxy map as a system list.

## Method

`GET`

## Observed Response Shape

```json
{
  "systems": [
    {
      "id": 1,
      "x": 803.393,
      "y": 399.07312,
      "sectorId": 1,
      "armId": 1,
      "starType": "orange",
      "securityZone": "sentinel",
      "requiresDeadPlanetOrigin": false,
      "hasColonies": true,
      "name": "A1-1",
      "visibility": "full"
    }
  ],
  "userSystemIds": [
    577
  ]
}
```

## Notes

- Confirmed as `parsedData.systems || parsedData` by the map interception layer.
- Used as the root source of known systems for scanning and analytics.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/map` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `systems`=14101, `userSystemIds`=6.
