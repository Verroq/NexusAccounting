# /api/fleet/reports/{id}

Returns full detail for one combat report.

## Method

`GET`

## Response Structure

```json
{
  "report": {
    "id": 27525,
    "missionId": 3959505,
    "attackerId": 428,
    "defenderId": 2366,
    "planetId": 70856,
    "moonId": null,
    "attackerFleet": [
      {
        "key": "cruiser",
        "name": "Cruiser",
        "quantity": 790,
        "shipDefId": 8
      }
    ],
    "defenderFleet": [
      {
        "key": "missile_cruiser",
        "name": "Missile Cruiser",
        "quantity": 164,
        "shipDefId": 12
      }
    ],
    "defenderDefenses": {
      "aaTurret": 0,
      "garrison": 1,
      "planetName": "Coruscant",
      "ewReduction": 0,
      "attackerName": "Verrok",
      "attackerTech": {
        "race": "terran",
        "hpBonus": 0.09999999999999999,
        "attackBonus": 0.01,
        "damageReduction": 0.06,
        "carrierHangarLevel": 0
      },
      "defenderName": "Joker",
      "defenderTech": {
        "race": "terran",
        "hpBonus": 0.2,
        "attackBonus": 0.01,
        "damageReduction": 0.1,
        "carrierHangarLevel": 0
      },
      "defenseTraps": 0,
      "defenseDamage": [
        {
          "key": "railgun_defense",
          "name": "Railgun Defense System",
          "damageAdded": 60
        }
      ],
      "participantSide": "attacker",
      "shieldGenerator": 1,
      "storageCloaking": 3,
      "planetaryDefense": [
        {
          "hp": 6080,
          "key": "railgun_defense",
          "name": "Railgun Defense System",
          "attack": 15,
          "quantity": 20
        }
      ],
      "attackerRetreated": false,
      "defenderRetreated": false,
      "pvpEconomicDamage": {
        "damaged": {
          "key": "alloy_foundry",
          "name": "Alloy Foundry",
          "damagePercent": 70
        }
      },
      "participantBreakdown": [
        {
          "race": "terran",
          "side": "attacker",
          "tech": {
            "hpBonus": 0.09999999999999999,
            "attackBonus": 0.01,
            "damageReduction": 0.06,
            "carrierHangarLevel": 0
          },
          "fleet": [
            {
              "key": "cruiser",
              "name": "Cruiser",
              "quantity": 590,
              "shipDefId": 8
            }
          ],
          "losses": [
            {
              "key": "transport_shuttle",
              "lost": 19,
              "name": "Transport Shuttle",
              "shipDefId": 22
            }
          ],
          "userId": 428,
          "username": "Verrok",
          "totalDamageDealt": 163765,
          "avatarUrl": "/images/avatars/explorer_3.webp",
          "portraitFrame": null
        }
      ],
      "shieldReinforcedUntil": "2026-07-07T11:57:37.545Z",
      "planetaryDefenseDamage": [
        {
          "key": "railgun_defense",
          "name": "Railgun Defense System",
          "level": 5,
          "damagePercent": 60,
          "strengthPercent": 40
        }
      ],
      "shieldReinforcedAfterCombat": true
    },
    "rounds": [
      {
        "round": 1,
        "events": [
          {
            "side": "attacker",
            "totalDamage": 70441,
            "damageByPlayer": {
              "428": 43817,
              "5587": 19672
            },
            "shieldAbsorbed": 100,
            "shipsDestroyed": [
              {
                "key": "missile_defense",
                "lost": 15,
                "name": "Missile Defense System"
              }
            ]
          }
        ],
        "attackerHpPercent": 99,
        "defenderHpPercent": 74
      }
    ],
    "outcome": "attacker_won",
    "attackerLosses": [
      {
        "key": "transport_shuttle",
        "lost": 19,
        "name": "Transport Shuttle",
        "damaged": 11,
        "destroyed": 8,
        "shipDefId": 22
      }
    ],
    "defenderLosses": [
      {
        "key": "missile_defense",
        "lost": 15,
        "name": "Missile Defense System",
        "damaged": 9,
        "destroyed": 6,
        "shipDefId": -455914
      }
    ],
    "lootStolen": {
      "ore": 3020,
      "alloys": 2713,
      "cryo_ice": 0,
      "hydrogen": 3695,
      "silicates": 1068,
      "bio_extract": 0,
      "dark_matter": 0,
      "plasma_core": 0,
      "quantum_dust": 0
    },
    "debrisField": {
      "ore": 64320,
      "alloys": 8040,
      "silicates": 32040
    },
    "shieldDamage": 400.00006,
    "garrisonParticipantIds": [
      428
    ],
    "outpostId": null,
    "outpostDamage": 0,
    "outpostCaptured": false,
    "outpostDestroyed": false,
    "isRead": true,
    "createdAt": "2026-07-06T11:57:37.498Z",
    "attackerProfile": {
      "userId": 428,
      "username": "Verrok",
      "avatarUrl": "/images/avatars/explorer_3.webp",
      "portraitFrame": null
    },
    "defenderProfile": {
      "userId": 2366,
      "username": "Joker",
      "avatarUrl": "/images/avatars/explorer_3.webp",
      "portraitFrame": "/images/frames/founder.png"
    },
    "currentUserBattleSide": "attacker",
    "isSaved": true
  }
}
```

## Notes

- Referenced by addon PvP processor to enrich list items.
- Live detail fetch depends on at least one available report ID.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/reports/27525` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `report.attackerFleet`=5, `report.defenderDefenses.defenseDamage`=2, `report.defenderDefenses.participantBreakdown`=2, `report.defenderDefenses.participantBreakdown[].fleet`=3, `report.defenderDefenses.planetaryDefense`=2, `report.defenderDefenses.planetaryDefenseDamage`=2, `report.defenderLosses`=3, `report.garrisonParticipantIds`=2, `report.rounds`=4, `report.rounds[].events`=2, `report.rounds[].events[].shipsDestroyed`=2.
