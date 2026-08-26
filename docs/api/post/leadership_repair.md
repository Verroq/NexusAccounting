# /api/leadership/repair

Starts repairing the command vessel at its current location.

## Method

`POST`

## Request Body

```text
(no request body)
```

## Response Structure

```json
{
  "vessel": {},
  "progress": {},
  "location": {},
  "destinations": [],
  "repair": {}
}
```

## Notes

- `repair` in [leadership.md](../get/leadership.md) reports whether this is allowed (`available`, `reason`), the cost after `costReduction`, the required `shipyard`, and `durationSeconds`.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
