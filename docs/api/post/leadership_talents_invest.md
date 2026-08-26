# /api/leadership/talents/invest

Spends one unspent talent point on a single talent, raising it by one rank.

## Method

`POST`

## Request Body

```json
{
  "key": "economy_construction_speed"
}
```

## Response Structure

```json
{
  "talent": {},
  "vessel": {},
  "progress": {}
}
```

## Notes

- `vessel.unspentTalentPoints` in [leadership.md](../get/leadership.md) is the budget for this call.
- The response returns only the single updated talent; the client merges it into its cached `talents[]`.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
