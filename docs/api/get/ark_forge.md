# /api/ark-forge

Returns the Ark Forge status: which moon hosts the forge and at what level, in-flight Titan conversions, the Titans available to convert, and where the resulting Ark Titans currently sit.

## Method

`GET`

## Response Structure

```json
{
  "forgeMoonId": null,
  "forgeLevel": 0,
  "conversions": [],
  "titansAvailable": [],
  "arkTitansOwned": 0,
  "arkTitansByMoon": [],
  "arkTitansByPlanet": []
}
```

## Notes

- The Ark Forge is a moon building: `forgeMoonId` is `null` and `forgeLevel` is `0` until one is built.
- `conversions[]` items carry `id`, `startedAt` and `completesAt`. A conversion takes 6 hours.
- `titansAvailable[]` items carry `location` (the location kind), `locationName`,
  `shipInventoryId` and `quantity`. Both `location` and `shipInventoryId` are what
  [ark_forge_convert.md](../post/ark_forge_convert.md) sends.
- `arkTitansByMoon[]` / `arkTitansByPlanet[]` list where already-converted Ark Titans are
  stationed; `arkTitansOwned` is the total.
- The client polls this every 30s while the forge panel is open.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/ark-forge` -> `200`.
- The sweep account has no Ark Forge built, so every array is empty and item fields come from the client bundle rather than a live sample.
