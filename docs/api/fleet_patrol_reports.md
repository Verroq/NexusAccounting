# /api/fleet/patrol-reports

Returns system patrol mission reports (hunt/guard patrols) with loot, losses and event log.

## Method

`GET`

## Response Structure

```json
{
  "reports": [
    {
      "id": 476,
      "missionId": 332562,
      "userId": 428,
      "sectorId": null,
      "eventType": "patrol_hunt_system_2",
      "eventTitle": "System Patrol \u00b7 Hunt (8h)",
      "eventDescription": "Your hunt patrol ran for 8 hours and logged 2 notable events.",
      "loot": {
        "ore": 793,
        "silicates": 587
      },
      "shipsLost": [
        {
          "quantity": 1,
          "shipDefId": 6
        }
      ],
      "explorationDuration": 28800,
      "sectorDepth": 0,
      "combatLog": {
        "mode": "hunt",
        "zone": "sentinel",
        "coverage": "system",
        "patrolEvents": [
          {
            "loot": {
              "ore": 244,
              "silicates": 256
            },
            "type": "pirate_encounter",
            "title": "Pirate Encounter",
            "lootTier": "common",
            "shipLoss": 0.06,
            "description": "A small pirate raiding party attacks your patrol. Your fleet engages."
          }
        ]
      },
      "isRead": true,
      "createdAt": "2026-06-14T05:51:23.438Z",
      "isSaved": false
    }
  ]
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/patrol-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=4, `reports[].combatLog.patrolEvents`=2.
