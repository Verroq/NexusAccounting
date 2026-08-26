# /api/fleet/pirate-reports

Returns pirate combat report feed.

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
      "id": 135854,
      "missionId": 11742510,
      "userId": 428,
      "campId": 708,
      "attackerFleet": [
        {
          "key": "cruiser",
          "name": "Cruiser",
          "quantity": 60,
          "shipDefId": 8
        }
      ],
      "pirateFleet": [
        {
          "key": "fighter",
          "name": "Fighter",
          "quantity": 33,
          "shipDefId": 5
        }
      ],
      "rounds": [
        {
          "round": 1,
          "events": [
            {
              "side": "attacker",
              "totalDamage": 6391,
              "damageByPlayer": {
                "428": 331
              },
              "shipsDestroyed": [
                {
                  "key": "interceptor",
                  "lost": 6,
                  "name": "Interceptor"
                }
              ]
            }
          ],
          "attackerShieldHp": 17405,
          "defenderShieldHp": 4947,
          "attackerHpPercent": 100,
          "defenderHpPercent": 77,
          "attackerShieldMaxHp": 18245,
          "defenderShieldMaxHp": 6468
        }
      ],
      "outcome": "attacker_won",
      "attackerLosses": [],
      "pirateLosses": [
        {
          "key": "interceptor",
          "lost": 13,
          "name": "Interceptor",
          "damaged": 3,
          "destroyed": 10,
          "shipDefId": 6
        }
      ],
      "participantBreakdown": [],
      "loot": {
        "ore": 4696,
        "alloys": 1240,
        "silicates": 4076
      },
      "debris": {
        "ore": 7990,
        "alloys": 1283,
        "silicates": 4250
      },
      "isRead": true,
      "createdAt": "2026-08-26T07:41:39.456Z",
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Current account sample had no pirate reports.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/pirate-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=5, `reports[].attackerFleet`=2, `reports[].pirateFleet`=4, `reports[].pirateLosses`=4, `reports[].rounds`=4, `reports[].rounds[].events`=2, `reports[].rounds[].events[].shipsDestroyed`=3.
