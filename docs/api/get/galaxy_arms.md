# /api/galaxy/arms

Returns the galaxy arm list and ordering metadata.

## Method

`GET`

## Response Structure

```json
{
  "arms": [
    {
      "id": 1,
      "name": "Alpha Arm",
      "index": 0,
      "angleOffset": 0,
      "sectorCount": 50
    }
  ]
}
```

## Notes

- Confirmed from the `Arm` TypeScript model.
- Used to build sector labeling and map navigation structure.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/arms` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `arms`=6.
