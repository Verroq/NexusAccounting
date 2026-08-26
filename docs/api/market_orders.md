# /api/market/orders

Returns paginated public market orders.

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
      "id": 43022,
      "userId": 14316,
      "username": "Mucha",
      "hubId": 10,
      "orderType": "buy",
      "offerResource": "silicates",
      "offerAmount": 100000,
      "offerRemaining": 100000,
      "requestResource": "ore",
      "requestAmount": 397000,
      "baseResource": "ore",
      "quoteResource": "silicates",
      "limitPrice": 0.2518891687657431,
      "baseAmount": 397000,
      "baseRemaining": 397000,
      "quoteAmount": 100000,
      "status": "active",
      "expiresAt": "2026-09-02T08:48:49.244Z",
      "createdAt": "2026-08-26T08:48:49.243Z"
    }
  ],
  "pagination": {
    "total": 207,
    "limit": 25,
    "offset": 0,
    "hasMore": true
  }
}
```

## Notes

- Confirmed from the `MarketOrder` model and consuming market view.
- The addon paginates until `pagination.hasMore` becomes false.
- No fee or commission fields are currently observed here.

## Arbitrage Check With Fee

If you want to test whether a cycle of up to three trades can still be profitable despite a 5% market fee per transaction, model each order as a directed edge:

- `requestResource -> offerResource`
- gross edge rate = `offerAmount / requestAmount`
- fee-adjusted buyer rate = `offerAmount / (requestAmount * 1.05)`

A cycle is profitable if the product of all fee-adjusted edge rates is greater than `1.0`.

Example for a three-step cycle:

```text
ore -> hydrogen -> silicates -> ore
```

Profit condition:

```text
(H_per_O / 1.05) * (S_per_H / 1.05) * (O_per_S / 1.05) > 1
```

This repository now includes a helper script that evaluates exactly that on a saved `/api/market/orders` response:

```powershell
pwsh ./scripts/analyze-market-arbitrage.ps1 -InputPath ./market-orders.json
```

The script:

- accepts either a raw `orders` array or an object with an `orders` property
- keeps the best active order per directed resource pair
- checks 2-step and 3-step cycles
- reports only fee-adjusted profitable cycles, or the best near-misses if none are profitable

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/market/orders?page=1&limit=25` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `orders`=25.
