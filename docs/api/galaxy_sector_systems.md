# /api/galaxy/sectors/{sectorId}/systems

Returns systems inside one sector.

## Method

`GET`

## Response Structure

```json
{
  "systems": [
    {
      "id": 80,
      "sectorId": 1,
      "name": "A2-30",
      "x": 906.61163,
      "y": 473.12454,
      "starType": "yellow",
      "securityZone": "sentinel",
      "planetCount": 9,
      "hasColonies": true,
      "visibility": "visible"
    }
  ]
}
```

## Notes

- Live-validated on `s0` (200).
