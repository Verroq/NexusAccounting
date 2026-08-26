# /api/artifacts/discard

Discards one or more artifacts permanently.

## Method

`POST`

## Request Body

```json
{
  "artifactIds": [38108]
}
```

## Response Structure

```json
{}
```

## Notes

- Takes a list, so the client discards in bulk from a multi-select.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
