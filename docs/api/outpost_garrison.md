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
- No live probe was possible in this sweep because no outpost ID was available for the current account.
