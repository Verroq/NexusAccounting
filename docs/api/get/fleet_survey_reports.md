# /api/fleet/survey-reports

Returns the authenticated player's survey results and follow-up opportunities.

## Method

`GET`

## Response Structure

```json
{
  "reports": [
    {
      "id": 3129005,
      "missionId": 11741490,
      "userId": 428,
      "systemId": 6905,
      "eventType": "pirate_fleet",
      "eventTitle": "Pirate Fleet",
      "eventDescription": "A pirate squadron scrambles to intercept! Heavy combat expected.",
      "loot": {
        "ore": 2078,
        "hydrogen": 710,
        "silicates": 1094
      },
      "uncollectedLoot": null,
      "salvageExpiresAt": null,
      "shipsLost": [],
      "shipsDamaged": [],
      "surveyDuration": 720,
      "securityZone": "dead",
      "combatLog": {
        "debris": {
          "ore": 6647,
          "alloys": 1028,
          "silicates": 3655
        },
        "rounds": [
          {
            "round": 1,
            "events": [
              {
                "side": "attacker",
                "totalDamage": 7048,
                "shipsDestroyed": [
                  {
                    "key": "fighter",
                    "lost": 12,
                    "name": "Fighter"
                  }
                ]
              }
            ],
            "attackerShieldHp": 17096,
            "defenderShieldHp": 3407,
            "attackerHpPercent": 100,
            "defenderHpPercent": 68,
            "attackerShieldMaxHp": 18018,
            "defenderShieldMaxHp": 5284
          }
        ],
        "outcome": "attacker_won",
        "pirateTier": "marauder",
        "playerTech": {
          "race": "terran",
          "hpBonus": 0.30000000000000004,
          "attackBonus": 0.03,
          "leaderHpBonus": 0,
          "damageReduction": 0.29000000000000004,
          "leaderAttackBonus": 0,
          "carrierHangarLevel": 1,
          "leaderShieldRegenBonus": 0
        },
        "pirateFleet": [
          {
            "quantity": 20,
            "shipDefId": 5
          }
        ],
        "attackerFleet": [
          {
            "key": "cruiser",
            "name": "Cruiser",
            "quantity": 60,
            "shipDefId": 8
          }
        ],
        "defenderFleet": [
          {
            "key": "fighter",
            "name": "Fighter",
            "quantity": 20,
            "shipDefId": 5
          }
        ],
        "attackerLosses": [],
        "defenderLosses": [
          {
            "key": "fighter",
            "lost": 20,
            "name": "Fighter",
            "damaged": 6,
            "destroyed": 14,
            "shipDefId": 5
          }
        ],
        "restedAnomalyBonus": {
          "applied": true,
          "multiplier": 2,
          "chargesRemaining": 9
        },
        "remainingPirateFleet": []
      },
      "investigated": true,
      "anomalyExpiresAt": null,
      "wormholesDetected": 0,
      "isRead": true,
      "createdAt": "2026-08-26T07:39:20.640Z",
      "requiresDeadPlanetOrigin": false,
      "systemName": "G45-5",
      "systemX": 67.55026,
      "systemY": 107.01705,
      "isSaved": false
    }
  ],
  "unreadCount": 0,
  "restedStatus": {
    "charges": 8,
    "maxCharges": 20,
    "bonusMultiplier": 2,
    "nextChargeAt": "2026-08-26T19:04:06.309Z"
  }
}
```

## Notes

- Confirmed from the `SurveyReport` model.
- This endpoint exposes loot, anomaly state, combat details, and follow-up timers in a single feed.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/survey-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=16, `reports[].combatLog.attackerFleet`=2, `reports[].combatLog.defenderFleet`=4, `reports[].combatLog.defenderLosses`=4, `reports[].combatLog.pirateFleet`=4, `reports[].combatLog.rounds`=4, `reports[].combatLog.rounds[].events`=2, `reports[].combatLog.rounds[].events[].shipsDestroyed`=3.
- `reports[].uncollectedLoot` is `null` once the loot has been collected.
