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
- `attachLeader` — optional boolean, accepted by every fleet mission endpoint. `true` sends the
  leadership vessel with the fleet (list its hull in `ships` with `quantity: 1`). See
  `fleet_mine.md` for a confirmed live example.
