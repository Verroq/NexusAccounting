# /api/fleet/expedition-reports

Returns expedition outcome reports.

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
      "id": 148638,
      "missionId": 11741465,
      "userId": 428,
      "sectorId": 98,
      "eventType": "abandoned_station",
      "eventTitle": "Abandoned Station",
      "eventDescription": "A derelict research station drifts in the darkness. Some automated defenses still active.",
      "loot": {
        "artifact": 1,
        "silicates": 4125,
        "plasma_core": 443,
        "quantum_dust": 576
      },
      "shipsLost": [],
      "explorationDuration": 1500,
      "sectorDepth": 2,
      "combatLog": null,
      "isRead": true,
      "createdAt": "2026-08-26T08:03:29.297Z",
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Current account sample had no reports.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/expedition-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=83.
