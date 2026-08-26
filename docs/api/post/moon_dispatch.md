# /api/moons/{moonId}/dispatch

Dispatches resources/ships from a moon to a target planet.

## Method

`POST`

## Request Structure

```json
{
  "missionType": "transfer",
  "targetPlanetId": 35572,
  "ships": [
    { "shipDefId": 6, "quantity": 5 }
  ],
  "cargo": {
    "ore": 1000
  }
}
```

## Response Structure

```json
{
  "mission": {}
}
```

## Notes

- Payload shape confirmed from addon logistics send logic.
- Safe invalid probe on `s0` returned `400 VALIDATION_ERROR`.
