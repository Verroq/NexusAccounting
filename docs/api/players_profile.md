# /api/players/{userId}/profile

Returns a public player profile for the specified user.

## Method

`GET`

## Response Structure

```json
{
  "profile": {
    "userId": 428,
    "username": "Verrok",
    "leaderType": "explorer",
    "bio": "Chill french player. Discovering the game.",
    "createdAt": "2026-06-06T00:41:29.497Z",
    "avatarUrl": "/images/avatars/explorer_3.webp",
    "title": null,
    "portraitFrame": null,
    "spokenLanguages": [
      "en"
    ],
    "rewardCosmetics": [
      {
        "key": "ship_skin_obsidian_eclipse_carrier",
        "type": "ship_skin",
        "shipDefKey": "carrier",
        "name": "Obsidian Eclipse Carrier Livery",
        "description": "An Obsidian Eclipse livery for the Carrier.",
        "asset": "/images/ships/obsidian_eclipse/carrier.webp",
        "sortOrder": 9407,
        "dropCollection": "obsidian_eclipse",
        "badge": "Obsidian Eclipse",
        "tooltip": "Obsidian Eclipse: a ship livery recovered from deep-space operations.",
        "rewardKind": "reward"
      }
    ],
    "isSelf": true,
    "isVacationMode": false,
    "alliance": {
      "id": 48,
      "name": "DAMOCLES",
      "tag": "SWORD",
      "iconKey": "alliance_17",
      "role": "member"
    },
    "scores": {
      "overall": {
        "rank": 258,
        "score": 33963899
      },
      "military": {
        "rank": 255,
        "score": 23573840
      },
      "economy": {
        "rank": 276,
        "score": 9295289
      },
      "research": {
        "rank": 212,
        "score": 1094770
      },
      "updatedAt": "2026-08-26T09:16:37.742Z"
    }
  }
}
```

## Notes

- Confirmed from the `PlayerProfile` model and the consuming service.
- The addon caches this response for one hour.
- Used for alliance member drill-down and player context panels.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/players/428/profile` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `profile.rewardCosmetics`=4, `profile.spokenLanguages`=2.
