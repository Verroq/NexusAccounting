# /api/fleet/dispatch

Dispatches ships for planet-to-planet transfer/delivery missions.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "targetPlanetId": 40001,
  "missionType": "transfer",
  "ships": [
    { "shipDefId": 6, "quantity": 10 }
  ],
  "cargo": {
    "ore": 10000
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

- Payload shape confirmed from `logistics-view.js` send logic.
- Safe invalid probe on `s0` returned `400 VALIDATION_ERROR` (`Invalid request body`).
