# /api/galaxy/systems/{systemId}/planets

Returns all scannable entities in a system: planets, asteroid fields, and moons.

## Method

`GET`

## Observed Response Shape

```json
{
  "planets": [
    {
      "id": 74062,
      "systemId": 5752,
      "name": "Homeworld",
      "position": 3,
      "planetType": "terra",
      "size": 220,
      "temperature": 24,
      "userId": 1234,
      "isHomeworld": true,
      "colonizedAt": "2026-01-01T00:00:00.000Z",
      "ownerName": "Commander"
    }
  ],
  "asteroidFields": [
    {
      "id": 11748,
      "systemId": 5752,
      "name": "G21-52-AF1",
      "position": 9,
      "fieldType": "ore",
      "richness": 3,
      "totalResources": 100000,
      "remainingResources": 85000
    }
  ],
  "moons": [
    {
      "id": 8102,
      "planetId": 74062,
      "systemId": 5752,
      "name": "Homeworld Moon",
      "moonType": "rocky",
      "size": 50,
      "position": 3,
      "buildingSlots": 8,
      "userId": 1234
    }
  ]
}
```

## Notes

- Confirmed as a multi-entity payload by the map interception logic.
- The addon stores `planets`, `asteroidFields`, and `moons` separately.
- This is one of the richest discovery endpoints in the game surface used by the addon.