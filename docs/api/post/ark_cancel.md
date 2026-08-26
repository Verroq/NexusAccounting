# /api/ark/{projectId}/cancel

Cancels an Ark project.

## Method

`POST`

## Request Body

```text
(no request body)
```

## Response Structure

```json
{}
```

## Notes

- Only the project initiator can call this.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
