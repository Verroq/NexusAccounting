# /api/fleet/system-debris

This endpoint returns a list of all currently active debris fields across the galaxy that the user's alliance or sensors might have access to.

## Payload Structure

```json
{
    "debris": [
        {
            "id": 87906,
            "systemId": 5735,
            "systemName": "G21-35",
            "systemX": 360.06854,
            "systemY": -524.01886,
            "ore": 1080,
            "silicates": 540,
            "hydrogen": 0,
            "alloys": 168,
            "cryo_ice": 0,
            "quantum_dust": 0,
            "plasma_core": 0,
            "bio_extract": 0,
            "dark_matter": 0,
            "expiresAt": "2026-06-25T05:44:30.399Z",
            "guardedByPirates": false,
            "remainingPirates": []
        },
        {
            "id": 87912,
            "systemId": 5750,
            "systemName": "G21-50",
            "systemX": 345.0984,
            "systemY": -520.897,
            "ore": 480,
            "silicates": 240,
            "alloys": 78,
            "expiresAt": "2026-06-25T05:45:22.947Z",
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
