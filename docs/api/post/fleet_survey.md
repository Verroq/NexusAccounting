# /api/fleet/survey

Dispatches a survey mission to a target system.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 74062,
  "targetSystemId": 5752,
  "ships": [
    {
      "shipDefId": 1,
      "quantity": 1
    }
  ]
}
```

## Response Structure

```json
{
  "mission": 1898256
}
```

## Notes

- Confirmed from the API client wrapper and the interception logic.
- The addon records the `targetSystemId` locally when this request is seen.