# /api/alliance-trade/orders

Returns paginated alliance-internal trade orders.

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
  "orders": [
    {
      "id": 22088,
      "userId": 3365,
      "username": "gogoboy43",
      "planetId": 96225,
      "planetName": "Colony D29-4 ORANGE",
      "planetPosition": 5,
      "orderType": "sell",
      "offerResource": "plasma_core",
      "offerAmount": 30000,
      "offerArtifactId": null,
      "offerArtifactName": null,
      "offerArtifactTier": null,
      "requestResource": "antimatter",
      "requestAmount": 11111111000,
      "status": "active",
      "expiresAt": "2026-08-31T11:58:44.718Z",
      "createdAt": "2026-08-24T11:58:44.716Z",
      "systemX": 273.18045,
      "systemY": 204.91216,
      "systemName": "D29-4",
      "armName": "Delta Arm",
      "sectorIndex": 28,
      "securityZone": "open"
    }
  ],
  "pagination": {
    "total": 30,
    "limit": 25,
    "offset": 0,
    "hasMore": true
  }
}
```

## Notes

- Used by the addon market tab via `GET_ALLIANCE_ORDERS`.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/alliance-trade/orders?page=1&limit=25` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `orders`=25.
