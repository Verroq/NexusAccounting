# /api/fleet/field-scan-reports

Returns asteroid field scan reports, including field richness and remaining resources at scan time.

## Method

`GET`

## Response Structure

```json
{
  "reports": [
    {
      "id": 297674,
      "missionId": 11552328,
      "userId": 428,
      "fieldId": null,
      "systemId": 4652,
      "fieldInfo": {
        "name": "B47-2-AF1",
        "type": "plasma",
        "source": "system_activity",
        "richness": 1.25,
        "precision": "activity",
        "scanSource": "survey",
        "systemName": "B47-2",
        "totalResources": 10000,
        "remainingResources": 3538
      },
      "detectedFleets": [
        {
          "userId": 942,
          "activity": "mining",
          "username": "Palidors",
          "profileUrl": "/players/942",
          "fleetComposition": null,
          "canDefend": true
        }
      ],
      "isRead": true,
      "createdAt": "2026-08-24T12:36:20.330Z",
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- `fieldInfo.precision` / `fieldInfo.scanSource` indicate how reliable the richness figures are.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/field-scan-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=128.
