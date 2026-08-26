# /api/logistics/hub-levels

Returns the logistics hub level and active route count per owned planet.

## Method

`GET`

## Response Structure

```json
{
  "hubLevels": [
    {
      "planetId": 29925,
      "planetName": "Terra",
      "hubLevel": 0,
      "routeCount": 0
    }
  ]
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/logistics/hub-levels` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `hubLevels`=6.
