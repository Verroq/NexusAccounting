# /api/fleet/collect-salvage

Dispatches a salvage collection mission for a survey report or anomaly result.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 74062,
  "reportId": 555001,
  "ships": [
    {
      "shipDefId": 6,
      "quantity": 20
    }
  ]
}
```

## Response Structure

```json
{
  "mission": 1899001
}
```

## Notes

- Confirmed from the API client wrapper.
- Designed for harvesting `uncollectedLoot` referenced by survey reports.