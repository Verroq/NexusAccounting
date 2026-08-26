# /api/command-center/fleet-templates

Returns saved fleet templates for the authenticated player.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 8295,
    "name": "[Dead] Investigation",
    "templateType": "anomaly",
    "composition": [
      {
        "quantity": 60,
        "shipDefId": 8
      }
    ],
    "createdAt": "2026-07-10T14:43:57.504Z"
  }
]
```

## Notes

- Confirmed from the `FleetTemplate` TypeScript model.
- Used to pre-fill fleet composition choices in automation workflows.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/command-center/fleet-templates` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `[].composition`=3.
