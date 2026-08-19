# /api/moons/{moonId}

Returns moon detail including building and queue data.

## Method

`GET`

## Response Structure

```json
{
  "moon": {
    "id": 49793,
    "name": "Moon",
    "moonType": "natural",
    "size": 1,
    "planetId": 35572,
    "userId": 9696,
    "buildingSlots": 8
  },
  "buildings": [],
  "queue": [],
  "allMoonDefs": []
}
```

## Notes

- Live-validated on `s0` (200).
