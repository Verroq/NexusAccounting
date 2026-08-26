# /api/leadership/talents/build

Applies a whole talent build at once (used by the client's build planner / after a respec).

## Method

`POST`

## Request Body

```json
{
  "talents": [
    { "key": "economy_construction_speed", "rank": 2 }
  ]
}
```

## Response Structure

```json
{
  "vessel": {},
  "talents": [],
  "progress": {},
  "respec": {},
  "creditBalance": 0
}
```

## Notes

- Talent keys and their max ranks come from `definitions.talents` in [leadership.md](../get/leadership.md).
- Respec cost and availability are in `respec` (`canResetFree`, `canResetPaid`, `priceCredits`).

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
