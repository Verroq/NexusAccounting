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