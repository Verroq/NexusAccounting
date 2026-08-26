# /api/fleet/wormhole-runs

Returns completed wormhole run history.

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
  "runs": [
    {
      "id": 750,
      "wormholeId": 65770,
      "missionId": 383861,
      "userId": 428,
      "status": "completed",
      "currentEncounter": 3,
      "totalEncounters": 3,
      "encounterLog": [
        {
          "loot": {
            "ore": 210,
            "alloys": 232,
            "silicates": 176
          },
          "type": "pirate_ambush",
          "title": "Pirate Ambush",
          "combat": true,
          "outcome": "victory",
          "encounter": 1,
          "shipsLost": [],
          "combatRounds": [
            {
              "round": 1,
              "events": [
                {
                  "side": "attacker",
                  "totalDamage": 385,
                  "shipsDestroyed": [
                    {
                      "key": "fighter",
                      "lost": 6,
                      "name": "Pirate Fighter"
                    }
                  ]
                }
              ],
              "attackerHpPercent": 83,
              "defenderHpPercent": 26
            }
          ]
        }
      ],
      "totalLoot": {
        "ore": 1626,
        "alloys": 232,
        "hydrogen": 471,
        "silicates": 1025
      },
      "totalShipsLost": [],
      "currentFleet": [
        {
          "quantity": 3,
          "shipDefId": 2
        }
      ],
      "encounterStartedAt": "2026-06-14T11:43:13.838Z",
      "nextEncounterAt": null,
      "jobId": null,
      "fragmentsEarned": 0,
      "scoutPeek": null,
      "questKey": null,
      "questState": null,
      "isRead": true,
      "createdAt": "2026-06-14T11:27:07.060Z",
      "isSaved": true
    }
  ],
  "unreadCount": 0
}
```

## Notes

- Current account sample had no runs.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/wormhole-runs` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `runs`=4, `runs[].currentFleet`=3, `runs[].encounterLog`=3, `runs[].encounterLog[].combatRounds`=3, `runs[].encounterLog[].combatRounds[].events`=2.
