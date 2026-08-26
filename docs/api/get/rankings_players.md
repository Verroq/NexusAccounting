# /api/rankings/players

Returns paginated player rankings by category and optional search.

## Method

`GET`

## Query Parameters

```text
category={military|economy|research|overall}
search={name}
limit={number}    (optional)
offset={number}   (optional)
```

## Response Structure

```json
{
  "leaderboard": [
    {
      "rank": 1,
      "userId": 6965,
      "username": "demona008",
      "leaderType": "warlord",
      "allianceId": 250,
      "allianceTag": "HELL",
      "allianceIconKey": "alliance_24",
      "isVacationMode": false,
      "avatarUrl": null,
      "portraitFrame": "/images/frames/founder.png",
      "title": "title_platinum_founder",
      "score": 664796759,
      "militaryScore": 633619140,
      "economyScore": 28479124,
      "researchScore": 2698495,
      "overallScore": 664796759
    }
  ],
  "pagination": {
    "total": 5848,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

## Notes

- Addon uses this endpoint to look up player rank by name.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/rankings/players` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `leaderboard`=100.
