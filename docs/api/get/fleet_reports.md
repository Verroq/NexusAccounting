# /api/fleet/reports

Returns paginated PvP/general combat report list.

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
  "reports": [
    {
      "id": 27525,
      "missionId": 3959505,
      "attackerId": 428,
      "defenderId": 2366,
      "planetId": 70856,
      "moonId": null,
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
      "isRead": true,
      "createdAt": "2026-07-06T11:57:37.498Z",
      "planetName": "Coruscant",
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
  ],
  "unreadCount": 0
}
```

## Notes

- The addon treats this as a lightweight list and fetches detail via `/api/fleet/reports/{id}` for full battle data.
- Sweep account now returns populated combat reports.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports`=9, `reports[].defenderLosses`=3.
