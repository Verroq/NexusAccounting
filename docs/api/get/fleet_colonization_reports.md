# /api/fleet/colonization-reports

Returns colonization mission reports.

## Method

`GET`

## Response Structure

```json
{
  "reports": [],
  "unreadCount": 0
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/colonization-reports` -> `200`.
- Live response was empty on the sweep account, so item fields are not observable yet.
