# /api/market/orders/{orderId}/fill

Executes a market trade against an existing order.

## Method

`POST`

## Request Structure

```json
{
  "fillAmount": 1000,
  "buyerHubId": 44
}
```

## Response Structure

```json
{}
```

## Notes

- The client currently handles this as a success-or-error operation.
- The exact success payload is not fully documented yet; the addon now captures and shows the raw response in the fill modal for inspection.
- This is the best candidate for discovering per-trade fee data at execution time if the server returns it.