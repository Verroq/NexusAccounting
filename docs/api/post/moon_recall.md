# /api/moons/{moonId}/recall

Recalls stationed ships from moon context back to a target planet.

## Method

`POST`

## Request Structure

```json
{
  "targetPlanetId": 35572,
  "ships": [
    { "shipDefId": 6, "quantity": 5 }
  ]
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
- Safe invalid probe on `s0` returned `400` with validation payload (`error`, `details`).
