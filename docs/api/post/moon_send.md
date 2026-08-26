# /api/moons/{moonId}/send

Sends ships/cargo from a planet to a moon.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
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
- Safe invalid probe on `s0` returned `400` with validation payload (`error`, `details`).
