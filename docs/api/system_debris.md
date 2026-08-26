# /api/fleet/system-debris

This endpoint returns a list of all currently active debris fields across the galaxy that the user's alliance or sensors might have access to.

## Payload Structure

```json
{
  "debris": [
    {
      "id": 1022386,
      "systemId": 777,
      "systemName": "A16-27",
      "systemX": -240.81459,
      "systemY": 557.3482,
      "securityZone": "sentinel",
      "locationType": "pirate_camp",
      "locationId": 1365,
      "createdAt": "2026-08-26T08:05:49.133Z",
      "ore": 425,
      "silicates": 212,
      "hydrogen": 0,
      "alloys": 68,
      "cryo_ice": 0,
      "quantum_dust": 0,
      "plasma_core": 0,
      "bio_extract": 0,
      "dark_matter": 0,
      "expiresAt": "2026-08-27T08:05:49.133Z",
      "requiresDeadPlanetOrigin": false,
      "guardedByPirates": false,
      "remainingPirates": []
    }
  ]
}
```

### Important Notes
- All resource fields (`ore`, `silicates`, `hydrogen`, `alloys`, `cryo_ice`, `quantum_dust`, `plasma_core`, `bio_extract`, `dark_matter`) use snake_case and are `0` when not present in the debris.
- `expiresAt`: The ISO 8601 timestamp representing when the debris field will decay and disappear if not harvested.
- `guardedByPirates`: Indicates whether hostile pirates are currently guarding the debris field. If true, `remainingPirates` will contain the composition of the pirate fleet.
- `remainingPirates`: An array of remaining pirate ships guarding the field.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/system-debris` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `debris`=2.
