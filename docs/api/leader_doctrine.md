# /api/leader/doctrine

Switches the diplomat leader doctrine. The change is subject to the cooldown reported by `canSwitchAt` on [leader.md](./leader.md).

## Method

`POST`

## Request Body

```json
{
  "doctrine": "<doctrine key>"
}
```

## Response Structure

```json
{}
```

## Notes

- The client re-fetches `GET /api/leader` right after this call and reads the new `canSwitchAt` from there rather than from this response.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
