# /api/stations/{stationId}/resource-log

Per-station ledger of everything that moved in or out: mining income the station generated for
itself, plus member withdrawals and deposits.

## Method

`GET`

## Query Parameters

- `offset` — row offset. **Paging is offset-only**: `page` and `limit` are accepted but ignored,
  and a page is always 50 rows.

## Response Structure

```json
{
  "logs": [
    { "id": 3723324, "action": "mining_income", "resource": "silicates", "amount": 426.48,
      "createdAt": "2026-09-09T11:20:13.601Z", "userId": null, "username": null },
    { "id": 3439410, "action": "withdraw", "resource": "plasma_core", "amount": 4877,
      "createdAt": "2026-09-05T13:26:29.157Z", "userId": 276, "username": "PafolLaguep" },
    { "id": 3581352, "action": "deposit", "resource": "ore", "amount": 21000,
      "createdAt": "2026-09-07T11:50:36.049Z", "userId": 5943, "username": "Ketch-Kroute" }
  ]
}
```

## Notes

- `action` observed: `mining_income` (the station's own production, `userId`/`username` null),
  `withdraw`, `deposit`.
- **`amount` is always positive** — the direction lives in `action`, so a signed ledger has to
  negate withdrawals itself.
- `resource` is snake_case (`plasma_core`, `cryo_ice`), unlike the camelCase fields on the
  station object (`plasmaCore`, `cryoIce`).
- There is no alliance-wide log: a combined view is N per-station fetches.

## Live Verification

- Verified 2026-09-09 on `s0`: `GET /api/stations/1033/resource-log` -> `200`, and offset paging
  probed across ~3000 rows on seven stations.
