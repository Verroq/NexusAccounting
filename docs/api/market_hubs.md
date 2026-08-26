# /api/market/hubs

Returns market hubs available for trade execution.

## Method

`GET`

## Observed Response Shape

```json
{
  "hubs": [
    {
      "id": 1,
      "armId": 1,
      "systemId": 501,
      "name": "Hub Alpha",
      "commissionRate": 0.05,
      "isActive": true,
      "systemX": 266.0373,
      "systemY": 661.60614,
      "starType": "blue_giant",
      "sectorIndex": 10,
      "armName": "Alpha Arm",
      "securityZone": "sentinel",
      "systemName": "Hub Alpha"
    }
  ]
}
```

## Notes

- Partial schema inferred from the fill-order modal.
- The addon only requires `id` and `name` and then joins the result with `/api/market/my-balances` by hub ID.
- The server may provide location or ownership metadata that the current UI ignores.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/market/hubs` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `hubs`=12.
