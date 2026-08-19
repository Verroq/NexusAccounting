# /api/galaxy/arms

Returns the galaxy arm list and ordering metadata.

## Method

`GET`

## Response Structure

```json
{
  "arms": [
    {
      "id": 3,
      "name": "Gamma",
      "index": 2,
      "angleOffset": 120,
      "sectorCount": 12
    }
  ]
}
```

## Notes

- Confirmed from the `Arm` TypeScript model.
- Used to build sector labeling and map navigation structure.