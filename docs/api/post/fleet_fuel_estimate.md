# /api/fleet/fuel-estimate

This endpoint calculates the fuel cost, travel time, and required resources to dispatch a specific fleet from a source planet to a target system.

## Payload Structure

```json
{
    "sourcePlanetId": 74062,
    "targetSystemId": 5752,
    "ships": [
        {
            "shipDefId": 21,
            "quantity": 1
        }
    ]
}
```

## Response Structure

```json
{
    "fuelCost": 26,
    "baseFuelCost": 27,
    "fuelBonus": -0.04,
    "distance": 177.65737069047404,
    "hydrogenAvailable": 1545.2891,
    "sufficient": true,
    "totalCargoCapacity": 540,
    "travelTime": 1853,
    "antimatterCost": 1,
    "antimatterAvailable": 0,
    "maxRange": 593.75,
    "tankerBonus": 0,
    "inRange": true,
    "hasDamagedShips": false,
    "garrisonFuelPerHour": 1,
    "usingJumpRoute": false
}
```

### Important Notes
- The endpoint evaluates if there is enough fuel currently available on the planet (`sufficient`).
- Calculates distance precisely.
- Accounts for tech bonuses (`fuelBonus`).
- Also calculates total effective cargo capacity (`totalCargoCapacity`), which is useful to ensure the fleet can carry the required load.
