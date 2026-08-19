# /api/fleet/mining-reports

Returns mining mission reports.

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
      "missionId": 2,
      "planetId": 35572,
      "reportType": "mining",
      "resourcesDelivered": { "ore": 1000 },
      "shipsLost": [],
      "combatOutcome": null,
      "createdAt": "2026-08-06T00:00:00.000Z",
      "planetName": "Alpha",
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Live-validated on `s0` (200) with populated report objects.
