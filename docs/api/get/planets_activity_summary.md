# /api/planets/activity-summary

Per-planet dashboard summary: building slots, build/shipyard queues, research, resource state and alerts for every owned planet in one call.

## Method

`GET`

## Response Structure

```json
{
  "planets": [
    {
      "planetId": 29925,
      "planetName": "Terra",
      "planetType": "terra",
      "isHomeworld": true,
      "systemName": "A12-27",
      "buildingSlots": {
        "used": 14,
        "max": 16
      },
      "buildQueue": {
        "used": 0,
        "max": 2
      },
      "buildingQueues": [],
      "shipyardQueues": [],
      "buildingQueue": null,
      "shipyardQueue": null,
      "research": {
        "name": "Plasma Weapons",
        "key": "plasma_weapons",
        "targetLevel": 4,
        "endsAt": "2026-08-27 06:13:03.056+00",
        "status": "in_progress"
      },
      "moons": []
    }
  ]
}
```

## Notes

- Single call covering all planets, so it avoids N x `/api/planets/{id}` fetches for overview screens.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/planets/activity-summary` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `planets`=6.
