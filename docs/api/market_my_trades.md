# /api/market/my-trades

Returns the authenticated player's completed trade history, including buyer and seller commissions.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 3001,
    "hubId": 44,
    "buyerHubId": 45,
    "resourceSold": "ore",
    "amountSold": 10000,
    "resourcePaid": "hydrogen",
    "amountPaid": 8500,
    "commissionSeller": 85,
    "commissionBuyer": 42,
    "sellerId": 1234,
    "buyerId": 5678,
    "createdAt": "2026-07-13T12:30:00.000Z"
  }
]
```

## Notes

- Confirmed from the `TradeRecord` model.
- This is the only endpoint in the current addon codebase where market commission data is explicitly present.
- Used for profitability analytics and fee reporting.