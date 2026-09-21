# /api/fleet/investigate

Dispatches an investigation mission against an anomaly or report that supports investigation.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 74062,
  "reportId": 555002,
  "ships": [
    {
      "shipDefId": 21,
      "quantity": 1
    }
  ]
}
```

## Response Structure

```json
{
  "mission": 1899002
}
```

## Notes

- Confirmed from the API client wrapper.
- Commonly paired with survey reports that have `investigated: false`.
- `attachLeader` — optional boolean, accepted by every fleet mission endpoint. `true` sends the
  leadership vessel with the fleet (list its hull in `ships` with `quantity: 1`). See
  `fleet_mine.md` for a confirmed live example.
