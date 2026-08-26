# /api/market/my-orders

Returns the player's own market orders. Top level is a bare array (no wrapper object).

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 9113,
    "hubId": 9,
    "orderType": "buy",
    "offerResource": "alloys",
    "offerAmount": 110487,
    "offerRemaining": 0,
    "requestResource": "hydrogen",
    "requestAmount": 154681,
    "baseResource": "hydrogen",
    "quoteResource": "alloys",
    "limitPrice": 0.7142894085246411,
    "baseAmount": 154681,
    "baseRemaining": 0,
    "quoteAmount": 110487,
    "status": "filled",
    "expiresAt": "2026-07-06T10:25:23.390Z",
    "createdAt": "2026-06-29T10:25:23.389Z",
    "sourcePlanetId": null
  }
]
```

## Notes

- Same item shape as `orders[]` in [market_orders.md](./market_orders.md), plus fill state via `offerRemaining` / `baseRemaining`.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/market/my-orders` -> `200`.
- Example above is a real response with every array truncated to its first item.
