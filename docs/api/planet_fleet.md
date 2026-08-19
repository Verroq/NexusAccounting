# /api/planets/{planetId}/fleet

Fetches the currently stationed fleet at the specified planet, along with detailed ship definitions.

## Payload Structure

```json
{
    "fleet": [
        {
            "id": 1757059,
            "planetId": 74062,
            "shipDefId": 1,
            "quantity": 14,
            "damagedQuantity": 0,
            "definition": {
                "id": 1,
                "key": "probe",
                "name": "Probe",
                "description": "Unmanned recon drone.",
                "shipClass": "recon",
                "speed": 25,
                "cargoCapacity": 0,
                "fuelRate": 0.5,
                "allowedCargo": null
            }
        }
    ],
    "cargoBonus": 0.08,
    "shuttleCargoBonus": 0.2
}
```

### Important Notes
- `fleet`: Array of available ships.
- `quantity`: Amount of ships available (not deployed on missions).
- `definition.cargoCapacity`: Base cargo capacity. Effective cargo capacity can be modified by `cargoBonus`.
- `definition.fuelRate`: The fuel consumed per unit distance.
- `definition.allowedCargo`: Restricts what resources the ship can carry. Null means it can carry any resource type.
- **Ship Keys**: Note that the Spy Probe is identified by the key `"spy_probe"`.
