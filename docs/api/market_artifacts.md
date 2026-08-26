# /api/market/artifacts

Returns artifact listings on the market, with the artifact definition inlined into each listing.

## Method

`GET`

## Response Structure

```json
{
  "listings": [
    {
      "id": 2362,
      "sellerUserId": 13506,
      "artifactDefId": 89,
      "priceResource": "alloys",
      "priceAmount": 150000,
      "hubId": 5,
      "status": "active",
      "createdAt": "2026-08-26T07:56:23.219Z",
      "key": "mass_production_protocol",
      "name": "Mass Production Protocol",
      "description": "Industrial optimization algorithms that accelerate all shipyard operations.",
      "tier": "epic",
      "scope": "planet",
      "effectType": "ship_build_time_bonus",
      "effectValue": 0.15,
      "effectResource": null,
      "duration": 259200
    }
  ],
  "pagination": {
    "total": 414,
    "limit": 25,
    "offset": 0,
    "hasMore": true
  }
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/market/artifacts` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `listings`=25.
