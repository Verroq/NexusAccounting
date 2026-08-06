# /api/alliances/my

Returns the currently authenticated player's alliance, including members, score blocks, and diplomacy status.

## Method

`GET`

## Response Structure

```json
{
  "alliance": {
    "id": 77,
    "name": "Example Alliance",
    "tag": "EXA",
    "description": "Alliance profile text",
    "leaderId": 1234,
    "memberCount": 18,
    "maxMembers": 25,
    "isRecruiting": true,
    "iconKey": "alliance_badge",
    "chatLanguage": "en",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "members": [
      {
        "userId": 1234,
        "role": "leader",
        "joinedAt": "2026-01-01T00:00:00.000Z",
        "username": "Commander",
        "race": "terran",
        "leaderType": "industrialist",
        "avatarUrl": null,
        "isVacationMode": false,
        "title": null,
        "portraitFrame": null
      }
    ],
    "scores": {
      "totalMilitary": 100000,
      "totalEconomy": 200000,
      "totalResearch": 50000,
      "totalOverall": 350000,
      "militaryRank": 4,
      "economyRank": 2,
      "researchRank": 7,
      "overallRank": 3,
      "lastCalculatedAt": "2026-07-13T12:00:00.000Z"
    },
    "diplomacy": [
      {
        "id": 9,
        "targetAllianceId": 88,
        "status": "ally",
        "acceptedAt": "2026-06-10T12:00:00.000Z",
        "targetName": "Neighbor Alliance",
        "targetTag": "NBR"
      }
    ]
  }
}
```

## Notes

- Confirmed from the `Alliance` TypeScript model used by the addon.
- The addon expects the response root to contain an `alliance` object.
- Useful for alliance roster, standings, and ranking overlays.