# /api/fleet/wormholes

Returns currently known wormhole entries.

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
  "wormholes": []
}
```

## Notes

- Current account sample had no entries.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/wormholes` -> `200`.
- Live response was empty on the sweep account; the example above is kept as the documented shape.
