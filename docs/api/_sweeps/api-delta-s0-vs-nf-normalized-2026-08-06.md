# API Delta Report (s0 vs nf, normalized)

Generated: 2026-08-06

Normalization: numeric IDs and query IDs replaced by {id}; response compared by root signature.

| Endpoint | s0 status | nf status | s0 signature | nf signature | s0 message | nf message |
|---|---:|---:|---|---|---|---|
| /api/command-center/fleet-templates | 200 | 200 | array-root | empty-object-or-empty-array |  |  |
| /api/market/my-balances | 200 | 403 | object:balances | object:code,error |  | Research Market Access to unlock trading |
| /api/market/my-trades | 200 | 403 | array-root | object:code,error |  | Research Market Access to unlock trading |
| /api/market/orders?page=1&limit=25 | 200 | 403 | object:orders,pagination | object:code,error |  | Research Market Access to unlock trading |
