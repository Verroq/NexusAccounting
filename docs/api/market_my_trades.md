# /api/market/my-trades

Returns the authenticated player's completed trade history, including buyer and seller commissions.

## Method

`GET`

## Response Structure

```json
[
  {
    "id": 26306,
    "hubId": 11,
    "buyerHubId": 9,
    "resourceSold": "silicates",
    "amountSold": 64544,
    "resourcePaid": "ore",
    "amountPaid": 184596,
    "commissionSeller": 5537,
    "commissionBuyer": 3227,
    "sellerId": 167,
    "buyerId": 428,
    "createdAt": "2026-07-27T08:27:01.366Z"
  }
]
```

## Notes

- Confirmed from the `TradeRecord` model.
- This is the only endpoint in the current addon codebase where market commission data is explicitly present.
- Used for profitability analytics and fee reporting.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/market/my-trades` -> `200`.
- Example above is a real response with every array truncated to its first item.
