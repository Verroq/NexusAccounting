# /api/ark-forge/conversions/{conversionId}/cancel

Cancels an in-progress Titan to Ark Titan conversion.

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

- `conversionId` is `conversions[].id` from [ark_forge.md](../get/ark_forge.md).

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
