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
- No live probe was possible in this sweep because no outpost ID was available for the current account.
