# /api/market/my-balances

Returns the authenticated player's available balances per hub and resource.

## Method

`GET`

## Observed Response Shape

```json
{
  "balances": [
    {
      "hubId": 44,
      "resource": "hydrogen",
      "available": 12000,
      "locked": 0
    }
  ]
}
```

## Notes

- `available` — amount deposited at this hub and available to place orders or fill trades.
- `locked` — amount currently reserved by open sell orders at this hub.
- The dashboard aggregates balances by resource across all hubs for overview widgets.
- The fill modal filters these balances by `requestResource` to determine which hubs can afford a trade.