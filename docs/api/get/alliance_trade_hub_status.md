# /api/alliance-trade/hub-status

Returns whether the player's alliance has a trade hub, who owns it, its level and order capacity.

## Method

`GET`

## Response Structure

```json
{
  "hasTradeHub": true,
  "hubOwner": "Palidors",
  "hubPlanet": "Palidors City",
  "hubLevel": 8,
  "activeOrderCount": 30,
  "orderCapacity": 120
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/alliance-trade/hub-status` -> `200`.
- Example above is a real response with every array truncated to its first item.
