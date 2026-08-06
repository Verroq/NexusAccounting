# /api/galaxy/map

Returns the visible galaxy map as a system list.

## Method

`GET`

## Observed Response Shape

```json
{
  "systems": [
    {
      "id": 5752,
      "x": 345.12,
      "y": -519.7,
      "sectorId": 21,
      "armId": 3,
      "visibility": "full",
      "securityZone": "gray"
    }
  ]
}
```

## Notes

- Confirmed as `parsedData.systems || parsedData` by the map interception layer.
- Used as the root source of known systems for scanning and analytics.