# /api/fleet/incoming

Returns hostile or foreign fleets inbound to the player's locations.

## Method

`GET`

## Response Structure

```json
{
  "incoming": []
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/incoming` -> `200`.
- Live response was empty on the sweep account, so item fields are not observable yet.
