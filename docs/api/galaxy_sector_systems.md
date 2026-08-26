# /api/galaxy/sectors/{sectorId}/systems

Returns systems inside one sector.

## Method

`GET`

## Response Structure

```json
{
  "systems": [
    {
      "id": 4701,
      "x": -717.9708,
      "y": 740.1799,
      "sectorId": 101,
      "armId": 3,
      "starType": "red_dwarf",
      "securityZone": "sentinel",
      "requiresDeadPlanetOrigin": false,
      "hasColonies": false,
      "visibility": "partial"
    }
  ]
}
```

## Notes


## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/sectors/101/systems` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `systems`=50.
- Live items no longer carry `name` or `planetCount`, which earlier revisions of this doc listed.
