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
      "id": 1,
      "userId": 123,
      "username": "Player",
      "planetId": 100,
      "planetName": "Alpha",
      "orderType": "sell",
      "offerResource": "ore",
      "offerAmount": 1000,
      "requestResource": "hydrogen",
      "requestAmount": 900,
      "status": "active",
      "expiresAt": "2026-08-06T00:00:00.000Z",
      "createdAt": "2026-08-06T00:00:00.000Z",
      "systemName": "A2-30",
      "securityZone": "sentinel"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 25,
    "offset": 0,
    "hasMore": false
  }
}
```

## Notes

- Live-validated on `s0` (200).
- Used by the addon market tab via `GET_ALLIANCE_ORDERS`.
