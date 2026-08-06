# /api/market/orders/{orderId}/fill

Legacy direct-fill endpoint for market orders.

## Method

`POST`

## Request Structure

```json
{
  "offerAmount": 1000
}
```

## Response Structure

No successful payload was observed in current live checks.

## Notes

- Safe invalid probe on `s0` returned `410 MARKET_DIRECT_FILL_DISABLED` with message: `Direct market fills are no longer available. Refresh the game to use the order book.`
- This indicates direct fills are currently disabled in the game backend.