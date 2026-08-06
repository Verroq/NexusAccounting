# /api/fleet/wormhole-runs

Returns completed wormhole run history.

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
  "runs": [],
  "unreadCount": 0
}
```

## Notes

- Live-validated on `s0` (200).
- Current account sample had no runs.
