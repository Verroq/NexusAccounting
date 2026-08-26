# /api/outposts/{outpostId}/collect

Collects resources from an outpost using a source planet fleet.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "ships": [
    { "shipDefId": 6, "quantity": 10 }
  ],
  "resourceFilter": ["ore", "hydrogen"]
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
