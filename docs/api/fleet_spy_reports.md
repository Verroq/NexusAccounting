# /api/fleet/spy-reports

Returns scouting/spy reports.

## Method

`GET`

## Query Parameters

```text
page={number}
limit={number}
```

## Response Structure

```json
{
  "reports": [
    {
      "id": 1,
      "outcome": "success",
      "resourceData": {},
      "fleetData": {},
      "buildingData": {},
      "defenseData": {},
      "isRead": false,
      "createdAt": "2026-08-06T00:00:00.000Z",
      "targetUsername": "Target"
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Live-validated on `s0` (200) with populated report objects.
