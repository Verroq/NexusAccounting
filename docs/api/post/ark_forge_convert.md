# /api/ark-forge/convert

Converts a Titan into an Ark Titan. The conversion takes 6 hours and is irreversible: the ship loses its weapon bay but gains the ability to anchor a Rift-sealing ritual.

## Method

`POST`

## Request Body

```json
{
  "kind": "moon",
  "shipInventoryId": 0
}
```

## Response Structure

```json
{
  "conversionId": 0
}
```

## Notes

- `kind` is the `location` field of the chosen `titansAvailable[]` entry (where the Titan is
  stationed); `shipInventoryId` is that same entry's `shipInventoryId`.
- Titans are built in a Moon Dockyard, so `titansAvailable` is empty until one exists.
- Ark Titans are what [the Rift Seal endpoints](../_sweeps/client-bundle-discovery-2026-08-26.md)
  consume; see `/api/rift-seal` in the discovery report.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
