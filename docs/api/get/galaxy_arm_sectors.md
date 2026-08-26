# /api/galaxy/arms/{armId}/sectors

Returns sectors belonging to a specific galaxy arm.

## Method

`GET`

## Response Structure

```json
{
  "sectors": [
    {
      "id": 101,
      "armId": 3,
      "index": 0,
      "name": "Gamma Arm - Sector 1",
      "controllerAllianceId": null,
      "controlledSince": null,
      "securityZone": "sentinel",
      "systemCount": 50,
      "colonizedPlanets": 0,
      "visibility": "partial"
    }
  ]
}
```

## Notes

- Confirmed from the `Sector` TypeScript model.
- Used to decorate systems with sector names and to schedule station sync per sector.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/arms/3/sectors` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `sectors`=50.
