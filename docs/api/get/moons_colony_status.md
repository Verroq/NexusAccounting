# /api/moons/colony-status

Returns moon colony count vs. cap, lunar operations tech state, and which planets hold shuttles.

## Method

`GET`

## Response Structure

```json
{
  "colonizedMoons": 2,
  "maxMoons": 3,
  "canColonize": true,
  "hasLunarOperations": true,
  "shuttleSources": [
    {
      "planetId": 92841,
      "quantity": 1,
      "planetName": "Silly Cat",
      "planetType": "crystalline",
      "systemName": "G35-41"
    }
  ]
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/moons/colony-status` -> `200`.
- Example above is a real response with every array truncated to its first item.
