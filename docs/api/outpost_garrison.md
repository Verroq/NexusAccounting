# /api/outposts/{outpostId}/garrison

Garrisons ships from a source planet to an outpost.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "ships": [
    { "shipDefId": 6, "quantity": 10 }
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

- Request shape confirmed from addon logistics send logic.
- Not probed: the sweep is read-only. Outpost IDs do now exist on the account (e.g. `654`), so a targeted write probe is possible if wanted.
