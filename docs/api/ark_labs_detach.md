# /api/ark/{projectId}/labs/{planetBuildingId}

Detaches a previously attached research lab from an Ark project.

## Method

`DELETE`

## Response Structure

```json
{}
```

## Notes

- Both ids come from [ark_detail.md](./ark_detail.md).

## Live Verification

- Not probed (DELETE is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
