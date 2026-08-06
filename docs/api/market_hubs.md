# /api/market/hubs

Returns market hubs available for trade execution.

## Method

`GET`

## Observed Response Shape

```json
{
  "hubs": [
    {
      "id": 44,
      "name": "Core Hub"
    }
  ]
}
```

## Notes

- Partial schema inferred from the fill-order modal.
- The addon only requires `id` and `name` and then joins the result with `/api/market/my-balances` by hub ID.
- The server may provide location or ownership metadata that the current UI ignores.