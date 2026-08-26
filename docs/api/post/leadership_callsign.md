# /api/leadership/callsign

Renames the command vessel.

## Method

`POST`

## Request Body

```json
{
  "callsign": "<2-40 characters>"
}
```

## Response Structure

```json
{
  "vessel": {}
}
```

## Notes

- The client enforces a length of 2 to 40 characters before sending.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
