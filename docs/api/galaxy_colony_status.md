# /api/galaxy/colony-status

Returns colony count vs. cap, colonization tech state, and which planets hold colony ships / tankers.

## Method

`GET`

## Response Structure

```json
{
  "currentColonies": 6,
  "maxColonies": 6,
  "canColonize": false,
  "hasColonizationTech": true,
  "colonyShipSources": [
    {
      "planetId": 29925,
      "quantity": 5,
      "planetName": "Terra",
      "planetType": "terra",
      "systemName": "A12-27",
      "tankerQuantity": 6
    }
  ],
  "colonyShipDefId": 17,
  "tankerShipDefId": 23
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/colony-status` -> `200`.
- Example above is a real response with every array truncated to its first item.
