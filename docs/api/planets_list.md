# /api/planets

Returns a compact list of the authenticated user's planets.

## Method

`GET`

## Response Structure

```json
{
  "planets": [
    {
      "id": 35572,
      "name": "Alpha",
      "planetType": "rocky",
      "isHomeworld": true,
      "colonizedAt": "2026-08-06T00:00:00.000Z",
      "systemId": 80,
      "position": 5,
      "systemName": "A2-30"
    }
  ]
}
```

## Notes

- Live-validated on `s0` (200).
- Used as the base list before fetching `/api/planets/{planetId}` detail.
