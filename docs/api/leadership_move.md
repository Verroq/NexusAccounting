# /api/leadership/move

Sends the command vessel to another location. Travel may be instant or timed depending on the destination.

## Method

`POST`

## Request Body

```json
{
  "destinationType": "planet",
  "destinationId": 29925
}
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

- Valid `destinationType`/`destinationId` pairs come from `destinations[]` in [leadership.md](./leadership.md); each entry also carries a `travelTime`.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
