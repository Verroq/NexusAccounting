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
      "id": 3109626,
      "missionId": 11741432,
      "planetId": 92841,
      "reportType": "delivery",
      "resourcesDelivered": {
        "ore": 28877,
        "silicates": 9623,
        "_cyclesDone": 6,
        "_miningSpeed": 1,
        "_drillBreakdowns": 12,
        "_miningCargoBonus": 0.4,
        "_miningCargoCapacity": 38500,
        "_miningCargoFlatBonus": 0,
        "_miningCargoAppliedBonus": 0.4
      },
      "cargoStolen": {},
      "shipsLost": [],
      "pirateFleet": [],
      "combatOutcome": null,
      "combatLog": null,
      "locationName": "G31-40 / G31-40-AF4",
      "isRead": true,
      "createdAt": "2026-08-26T09:06:05.189Z",
      "planetName": "Silly Cat",
      "fleetComposition": [
        {
          "quantity": 270,
          "shipDefId": 6,
          "shipName": "Interceptor",
          "shipKey": "interceptor",
          "shipClass": "combat",
          "cargoCapacity": 70,
          "miningCargoCapacity": 0,
          "attack": 35,
          "hp": 200,
          "shieldHp": 50
        }
      ],
      "miningCargoCapacityTotal": 38500,
      "cycleCount": 6,
      "drillBreakdowns": 12,
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Report objects are populated on the sweep account.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/mining-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=150, `reports[].fleetComposition`=3.
