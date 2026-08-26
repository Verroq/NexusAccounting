# /api/planets

Returns a compact list of the authenticated user's planets.

## Method

`GET`

## Response Structure

```json
{
  "planets": [
    {
      "id": 29925,
      "name": "Terra",
      "planetType": "terra",
      "isHomeworld": true,
      "colonizedAt": "2026-06-06T00:41:29.508Z",
      "sortOrder": 0,
      "systemId": 577,
      "position": 4,
      "systemName": "A12-27"
    }
  ]
}
```

## Notes

- Used as the base list before fetching `/api/planets/{planetId}` detail.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/planets` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `planets`=6.
