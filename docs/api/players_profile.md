# /api/players/{userId}/profile

Returns a public player profile for the specified user.

## Method

`GET`

## Response Structure

```json
{
  "profile": {
    "userId": 1234,
    "username": "Commander",
    "leaderType": "industrialist",
    "bio": "Profile text",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "avatarUrl": null,
    "title": null,
    "portraitFrame": null,
    "spokenLanguages": ["en", "de"],
    "isVacationMode": false,
    "scores": {
      "overall": { "rank": 10, "score": 123456 },
      "military": { "rank": 14, "score": 45678 },
      "economy": { "rank": 9, "score": 65432 },
      "research": { "rank": 7, "score": 12346 },
      "updatedAt": "2026-07-13T12:00:00.000Z"
    }
  }
}
```

## Notes

- Confirmed from the `PlayerProfile` model and the consuming service.
- The addon caches this response for one hour.
- Used for alliance member drill-down and player context panels.