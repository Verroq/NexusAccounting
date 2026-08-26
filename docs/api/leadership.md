# /api/leadership

Returns the full leadership (command vessel) state: vessel stats, combat stats, equipped module effects, XP progress, travel destinations, repair state, owned modules, talents, XP history, respec state, and the complete static definitions for lanes, talents, modules, crew and commander perks.

## Method

`GET`

## Response Structure

```json
{
  "enabled": true,
  "universeKey": "s0",
  "unlocked": true,
  "vessel": {
    "id": 432,
    "userId": 428,
    "callsign": "Ika",
    "level": 7,
    "experience": 14935,
    "unspentTalentPoints": 0,
    "hullIntegrity": 292,
    "maxHullIntegrity": 550,
    "status": "attached",
    "commandAttack": 0,
    "commandDefense": 7,
    "commandLogistics": 0,
    "commandInsight": 0,
    "currentPlanetId": null,
    "currentMoonId": null,
    "currentStationId": null,
    "currentOutpostId": null,
    "destinationPlanetId": null,
    "destinationMoonId": null,
    "destinationStationId": null,
    "destinationOutpostId": null,
    "assignedMissionId": 11749232,
    "travelStartedAt": null,
    "travelEndsAt": null,
    "recoveryEndsAt": null,
    "lastTalentResetAt": null,
    "createdAt": "2026-07-28T20:58:46.802Z",
    "updatedAt": "2026-08-26T09:09:30.322Z"
  },
  "combatStats": {
    "currentHull": 659,
    "maxHull": 1242,
    "shield": 163,
    "attack": 285,
    "weaponType": "laser",
    "damageReduction": 0.04,
    "evasion": 0.032,
    "repairPerRound": 0,
    "rapidFireByTarget": {
      "cruiser": 3,
      "missile_cruiser": 3
    }
  },
  "effectiveEquippedEffects": [
    {
      "moduleId": 1944,
      "effects": [
        {
          "label": "Leadership HP",
          "value": 0.08,
          "unit": "percent",
          "scope": "self",
          "selfStat": "hull_percent"
        }
      ]
    }
  ],
  "progress": {
    "level": 7,
    "xpIntoLevel": 5485,
    "xpRequiredForNext": 5800,
    "percent": 95
  },
  "levelCap": 12,
  "location": {
    "type": "mission",
    "id": 11749232,
    "label": "Fleet mission #11749232",
    "assignment": {
      "missionId": 11749232,
      "missionType": "expedition",
      "status": "exploring",
      "sourceLabel": "Negi's Mom Geisha Balls",
      "targetLabel": null,
      "targetSystemId": null,
      "targetSystemName": null,
      "arrivesAt": "2026-08-26T09:44:34.357Z",
      "returnArrivesAt": null
    }
  },
  "destinations": [],
  "repair": {
    "available": false,
    "reason": "Command vessel is assigned to a fleet",
    "missingHull": 258,
    "maxHull": 550,
    "durationSeconds": 3941,
    "cost": {
      "alloys": 30
    },
    "baseCost": {
      "alloys": 30
    },
    "costReduction": 0,
    "shipyard": null,
    "endsAt": null
  },
  "modules": [
    {
      "id": 879,
      "userId": 428,
      "vesselId": null,
      "slot": "auxiliary",
      "key": "nano_repair_04",
      "rarity": "rare",
      "level": 1,
      "equipped": false,
      "metadata": {
        "owned": true,
        "title": "\u041d\u0430\u043d\u043e\u0440\u0435\u043c\u043e\u043d\u0442 \u00ab\u0416\u0438\u0432\u043e\u0439 \u041a\u043e\u0440\u043f\u0443\u0441\u00bb",
        "reward": true,
        "source": "leadership_quest",
        "effects": [
          {
            "unit": "percent",
            "label": "Leadership repair per round",
            "scope": "self",
            "value": 0.04,
            "selfStat": "repair_per_round"
          }
        ],
        "starter": false,
        "sourceRef": "leadership_strange_wormhole:36618:rare_module",
        "description": "Nano Repair module. Swap time is based on rarity.",
        "swapDurationSeconds": 7200
      },
      "createdAt": "2026-07-28T22:34:42.430Z"
    }
  ],
  "talents": [
    {
      "id": 5356,
      "vesselId": 432,
      "key": "economy_construction_speed",
      "rank": 2,
      "createdAt": "2026-08-17T12:29:52.455Z",
      "updatedAt": "2026-08-21T09:06:33.936Z"
    }
  ],
  "xpEvents": [
    {
      "id": 341098,
      "vesselId": 432,
      "source": "anomaly_danger",
      "sourceRef": "mission:11745067",
      "amount": 7,
      "metadata": {
        "systemId": 4609,
        "dangerous": true,
        "eventType": "pirate_base",
        "missionId": 11745067,
        "rawAmount": 70,
        "securityZone": "dead",
        "diminishingBucket": "anomaly",
        "diminishingOrdinal": 5,
        "diminishingMultiplier": 0.1
      },
      "grantedAt": "2026-08-26T08:16:14.397Z"
    }
  ],
  "xpDiminishing": {
    "resetsAt": "2026-08-27T00:00:00.000Z",
    "multipliers": [
      1
    ],
    "buckets": [
      {
        "bucket": "anomaly",
        "count": 5
      }
    ]
  },
  "respec": {
    "lastResetAt": null,
    "paidAvailableAt": null,
    "freeAvailableAt": null,
    "canResetPaid": false,
    "canResetFree": true,
    "priceCredits": 100,
    "totalTalentPoints": 7
  },
  "creditBalance": 0,
  "definitions": {
    "lanes": [
      {
        "key": "military",
        "label": "Military Doctrine",
        "description": "Fleet attack, repairs, shields, first-round pressure and hostile signal disruption."
      }
    ],
    "talents": [
      {
        "key": "military_fleet_attack",
        "lane": "military",
        "tier": 1,
        "label": "Fleet Attack",
        "shortLabel": "Attack",
        "maxRank": 2,
        "description": "Standardized firing cadence and target priority increase fleet attack power.",
        "effects": [
          {
            "label": "Fleet attack",
            "value": 0.03,
            "unit": "percent",
            "perRank": true,
            "scope": "global",
            "leaderBonus": "attackBonus"
          }
        ]
      }
    ],
    "modules": [
      {
        "key": "leadership_engine_01",
        "slot": "engine",
        "rarity": "common",
        "label": "\u041c\u0430\u043d\u0435\u0432\u0440\u043e\u0432\u044b\u0439 \u0443\u0441\u043a\u043e\u0440\u0438\u0442\u0435\u043b\u044c \u00ab\u0421\u0442\u0430\u0440\u0442\u00bb",
        "description": "Leadership Engine module. Swap time is based on rarity.",
        "effects": [
          {
            "label": "Leadership speed",
            "value": 1,
            "unit": "flat",
            "scope": "self",
            "selfStat": "command_speed"
          }
        ],
        "swapDurationSeconds": 1800
      }
    ],
    "crew": [
      {
        "key": "ace_pilot_lina_veil",
        "role": "Ace Pilot",
        "grade": "specialist",
        "label": "\u041b\u0438\u043d\u0430 \u0412\u0435\u0439\u043b, \"\u0420\u043e\u0432\u043d\u044b\u0439 \u041a\u0443\u0440\u0441\"",
        "origin": "Command Flight School",
        "description": "A leadership-vessel pilot focused on command-ship handling and survival.",
        "effects": [
          {
            "label": "Leadership speed",
            "value": 0.01,
            "unit": "percent",
            "scope": "self",
            "selfStat": "command_speed_percent"
          }
        ]
      }
    ],
    "commanderPerks": {
      "warlord": [
        {
          "key": "warlord_pirate_base_loot",
          "leaderType": "warlord",
          "unlockLevel": 3,
          "label": "Pirate Base Spoils",
          "shortLabel": "Pirate Spoils",
          "local": true,
          "description": "Attached fleets recover more loot from pirate bases.",
          "effects": [
            {
              "label": "Pirate base loot",
              "value": 0.3,
              "unit": "percent",
              "scope": "local_operation",
              "leaderBonus": "pirateCampLootBonus"
            }
          ]
        }
      ],
      "industrialist": [
        {
          "key": "industrialist_field_mining_volume",
          "leaderType": "industrialist",
          "unlockLevel": 3,
          "label": "Field Extraction Volume",
          "shortLabel": "Field Mining",
          "local": true,
          "description": "Attached mining fleets extract more resources from asteroid fields.",
          "effects": [
            {
              "label": "Asteroid field yield",
              "value": 0.15,
              "unit": "percent",
              "scope": "local_operation",
              "leaderBonus": "miningYieldBonus"
            }
          ]
        }
      ],
      "scientist": [
        {
          "key": "scientist_anomaly_research_speed",
          "leaderType": "scientist",
          "unlockLevel": 3,
          "label": "Anomaly Research Protocols",
          "shortLabel": "Survey Time",
          "local": true,
          "description": "System surveys launched from the planet hosting the ready command vessel take 30% less time.",
          "effects": [
            {
              "label": "System survey time",
              "value": 0.3,
              "unit": "percent",
              "scope": "local_operation",
              "leaderBonus": "anomalyResearchSpeedBonus"
            }
          ]
        }
      ],
      "explorer": [
        {
          "key": "explorer_anomaly_loot",
          "leaderType": "explorer",
          "unlockLevel": 3,
          "label": "Anomaly Spoils",
          "shortLabel": "Anomaly Loot",
          "local": true,
          "description": "Attached anomaly operations recover more loot.",
          "effects": [
            {
              "label": "Anomaly loot",
              "value": 0.15,
              "unit": "percent",
              "scope": "local_operation",
              "leaderBonus": "surveyLootBonus"
            }
          ]
        }
      ],
      "diplomat": [
        {
          "key": "diplomat_bounty_rewards",
          "leaderType": "diplomat",
          "unlockLevel": 3,
          "label": "Contract Leverage",
          "shortLabel": "Bounty Rewards",
          "local": false,
          "description": "Daily and weekly bounty rewards are doubled.",
          "effects": [
            {
              "label": "Daily and weekly rewards",
              "value": 1,
              "unit": "percent",
              "scope": "global",
              "leaderBonus": "dailyWeeklyRewardBonus"
            }
          ]
        }
      ]
    }
  }
}
```

## Notes

- `definitions` carries the entire static catalogue and dominates the payload size (the live response is ~600 KB). Cache it; the per-account parts are `vessel`, `modules`, `talents`, `progress`, `repair`, `respec`, `xpEvents`, `xpDiminishing`.
- `enabled` / `unlocked` gate the whole subsystem: `enabled` is per-universe, `unlocked` is per-account.
- `location` (`type`, `id`, `label`, `assignment`) is where the vessel currently sits; `destinations` is what `POST /api/leadership/move` will accept.
- `combatStats` is what the vessel contributes to a battle, including `rapidFireByTarget`.
- `xpDiminishing` describes the anti-farm buckets and their reset time, which caps XP per source.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/leadership` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `definitions.commanderPerks.diplomat`=4, `definitions.commanderPerks.explorer`=4, `definitions.commanderPerks.industrialist`=4, `definitions.commanderPerks.scientist`=4, `definitions.commanderPerks.warlord`=4, `definitions.crew`=174, `definitions.lanes`=3, `definitions.modules`=407, `definitions.talents`=18, `effectiveEquippedEffects`=14, `effectiveEquippedEffects[].effects`=2, `modules`=43.
