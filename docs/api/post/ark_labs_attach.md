# /api/ark/{projectId}/labs

Attaches one of the caller's research labs to an Ark project, contributing it to the build.

## Method

`POST`

## Request Body

```json
{
  "planetBuildingId": 17967
}
```

## Response Structure

```json
{}
```

## Notes

- `planetBuildingId` is `buildings[].id` from [planets_detail.md](../get/planets_detail.md) where
  `definition.key == "research_lab"` and `level >= 1`.
- The client only offers labs that are not already attached (compared against
  `labs[].planetBuildingId` in [ark_detail.md](../get/ark_detail.md)).
- Attaching a lab below level 15, under-powered, or damaged is accepted but does not count
  toward `qualifyingLabCount`.

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
