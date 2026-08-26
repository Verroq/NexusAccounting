# /api/alliances/my

Returns the currently authenticated player's alliance, including members, score blocks, and diplomacy status.

## Method

`GET`

## Response Structure

```json
{
  "alliance": {
    "id": 48,
    "name": "DAMOCLES",
    "tag": "SWORD",
    "description": "**International Alliance**\n\nAn **actif**, **organised** community present every day, both in-game and on **Discord**....",
    "leaderId": 942,
    "memberCount": 35,
    "maxMembers": 46,
    "isRecruiting": true,
    "iconKey": "alliance_17",
    "chatLanguage": "fr",
    "disbandRequestedAt": null,
    "disbandScheduledAt": null,
    "disbandRequestedBy": null,
    "vulnerabilityWindowStartMinute": 1140,
    "pendingVulnerabilityWindowStartMinute": 1020,
    "pendingVulnerabilityEffectiveAt": "2026-08-03T19:52:53.373Z",
    "vulnerabilityWindowChangedAt": "2026-07-31T19:52:53.373Z",
    "stationCaptureBlockedUntil": "2026-08-17T21:57:18.849Z",
    "allyPactCooldownUntil": null,
    "createdAt": "2026-06-08T12:41:20.730Z",
    "members": [
      {
        "userId": 942,
        "role": "leader",
        "joinedAt": "2026-07-07T23:26:56.167Z",
        "username": "Palidors",
        "race": "terran",
        "leaderType": "industrialist",
        "avatarUrl": "/images/avatars/industrialist_6.webp",
        "isVacationMode": false,
        "militaryScore": 186631660,
        "economyScore": 21568672,
        "researchScore": 1753002,
        "overallScore": 209953334,
        "diplomaticEmbassyContributionLevel": 11,
        "title": null,
        "portraitFrame": "/images/frames/command_center.png"
      }
    ],
    "scores": {
      "totalMilitary": 1217310590,
      "totalEconomy": 344751406,
      "totalResearch": 37804098,
      "totalOverall": 1599866094,
      "militaryRank": 4,
      "economyRank": 5,
      "researchRank": 3,
      "overallRank": 4,
      "lastCalculatedAt": "2026-08-26T09:16:39.503Z"
    },
    "diplomacy": [
      {
        "id": 1189,
        "targetAllianceId": 234,
        "status": "non_aggression_pact",
        "acceptedAt": "2026-07-27T22:12:54.181Z",
        "targetName": "Fassflieger",
        "targetTag": "FASS"
      }
    ],
    "territories": {
      "stationCount": 65,
      "stations": [
        {
          "id": 1315,
          "name": "Station Epsilon",
          "sectorId": 93,
          "systemId": 4495,
          "capturedAt": "2026-08-16T16:28:32.689Z",
          "shieldHp": 7000,
          "shieldMaxHp": 7000
        }
      ]
    },
    "stationCapture": {
      "enabled": true,
      "timezone": "CET",
      "durationMinutes": 240,
      "startMinute": 1020,
      "usesDefault": false,
      "pendingStartMinute": null,
      "pendingEffectiveAt": null,
      "changedAt": "2026-07-31T19:52:53.373Z",
      "nextChangeAt": "2026-08-07T19:52:53.373Z"
    }
  }
}
```

## Notes

- Confirmed from the `Alliance` TypeScript model used by the addon.
- The addon expects the response root to contain an `alliance` object.
- Useful for alliance roster, standings, and ranking overlays.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/alliances/my` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `alliance.diplomacy`=5, `alliance.members`=35, `alliance.territories.stations`=12.
