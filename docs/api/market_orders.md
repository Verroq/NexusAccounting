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
      "id": 2001,
      "userId": 1234,
      "username": "Trader",
      "hubId": 44,
      "orderType": "sell",
      "offerResource": "ore",
      "offerAmount": 10000,
      "offerRemaining": 6400,
      "requestResource": "hydrogen",
      "requestAmount": 8500,
      "status": "active",
      "expiresAt": "2026-07-14T12:00:00.000Z",
      "createdAt": "2026-07-13T12:00:00.000Z"
    }
  ],
  "pagination": {
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