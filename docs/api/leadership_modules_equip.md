# /api/leadership/modules/equip

Equips a leadership module on the command vessel.

## Method

`POST`

## Request Body

```json
{
  "moduleId": 879
}
```

## Response Structure

```json
{
  "modules": [],
  "vessel": {},
  "combatStats": {},
  "effectiveEquippedEffects": [],
  "repair": {}
}
```

## Notes

- `moduleId` is `modules[].id` from [leadership.md](./leadership.md), not the module `key`.
- The response returns the recomputed slices of the leadership state, so a full `GET /api/leadership` refetch is not needed.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
