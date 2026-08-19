# /api/command-center/fleet-templates

Returns saved fleet templates for the authenticated player.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 11,
    "name": "Scout Pair",
    "templateType": "survey",
    "composition": [
      {
        "quantity": 2,
        "shipDefId": 1
      }
    ],
    "createdAt": "2026-07-10T12:00:00.000Z"
  }
]
```

## Notes

- Confirmed from the `FleetTemplate` TypeScript model.
- Used to pre-fill fleet composition choices in automation workflows.