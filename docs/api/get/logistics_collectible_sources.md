# /api/logistics/collectible-sources

Returns the outposts, moons and stations that can be used as collection sources for logistics routes.

## Method

`GET`

## Response Structure

```json
{
  "outposts": [
    {
      "id": 654,
      "name": "Outpost G45",
      "fieldType": null,
      "isDrifting": true
    }
  ],
  "moons": [
    {
      "id": 125918,
      "name": "Negi's Mom Nipple Clamp-a",
      "planetId": 89639,
      "moonType": "metallic",
      "planetName": "Negi's Mom Nipple Clamp"
    }
  ],
  "stations": [
    {
      "id": 20,
      "name": "Station Epsilon",
      "systemName": "A47-45"
    }
  ]
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/logistics/collectible-sources` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `moons`=2, `outposts`=5, `stations`=45.
