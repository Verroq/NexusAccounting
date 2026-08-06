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
      "userId": 9696,
      "username": "Uuuren",
      "leaderType": "industrialist",
      "allianceTag": "TAG",
      "isVacationMode": false,
      "score": 123456,
      "militaryScore": 12000,
      "economyScore": 80000,
      "researchScore": 30000,
      "overallScore": 122000
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 25,
    "offset": 0,
    "hasMore": false
  }
}
```

## Notes

- Live-validated on `s0` (200).
- Addon uses this endpoint to look up player rank by name.
