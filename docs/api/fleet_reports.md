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
      "id": 1,
      "outcome": "attacker_won",
      "currentUserBattleSide": "attacker",
      "attackerProfile": { "username": "A" },
      "defenderProfile": { "username": "D" },
      "createdAt": "2026-08-06T00:00:00.000Z"
    }
  ],
  "unreadCount": 0
}
```

## Notes

- The addon treats this as a lightweight list and fetches detail via `/api/fleet/reports/{id}` for full battle data.
- Live-validated on `s0` (200); current account sample had an empty list.
