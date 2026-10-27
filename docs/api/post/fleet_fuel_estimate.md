# /api/fleet/fuel-estimate

This endpoint calculates the fuel cost, travel time, and required resources to dispatch a specific fleet from a source planet to a target.
One target and one fleet per call: no batch form exists, and the game client
never computes fuel locally (checked in the client bundle on 2026-10-09).

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

### Optional fields (as sent by the game client)

| Field | Values / use |
|---|---|
| `missionType` | `survey`, `mine`, `investigate`, `collect_salvage`, `collect_debris`, `beacon_collect`, `attack_pirates`, `scout_camp`, `wormhole`, `colonize`, `spy`, `spy_station`, `cyber_attack`, `mine_deploy`, `mine_sweep`, `mine_clear`, `market_pickup`, `market_deliver`, `artifact_transfer`, `artifact_pickup`, `artifact_deliver` |
| `targetPlanetId` / `targetMoonId` / `targetStationId` | Instead of `targetSystemId` for planet-, moon- or station-targeted missions. |
| `useHighway` | `true` when the dialog's highway toggle is on (market, station, moon sends). |
| `speedFactor` | `< 1` to fly slower (market and artifact missions). Sent only when below 1. |
| `attachLeader` | `true` to include the fleet leader. |
| `skipActivityTravelPolicy` | `true` from the investigate / attack-pirates dialogs. |

Effects measured live (2026-10-09, one ship def 21, same source):

| Target | Payload extra | `travelTime` | `fuelCost` |
|---|---|---|---|
| system 1843 (dead) | none | 6766 | 34 |
| system 1843 (dead) | `missionType: survey` / `mine` / `investigate` | 24236 | 34 |
| system 1843 (dead) | `useHighway: true` (no highway on route) | 6766 | 34 |
| system 1843 (dead) | `missionType: market_pickup`, `speedFactor: 0.5` | 8192 | 18 |
| system 10 (sentinel) | none | 8030 | 37 |
| system 10 (sentinel) | `missionType: mine` / `survey` | 7323 | 37 |

- **`missionType` changes `travelTime`, not fuel.** For a dead-zone target the
  activity missions took 3.6× longer. Send the real `missionType` whenever the
  travel time is displayed. `fuelCost` was the same with or without it.
- `speedFactor` lowers fuel and lengthens travel.
- `missionType: "mine"` adds `miningCargoCapacity`, `miningCargoBonus`,
  `miningCargoFlatBonus` to the response.

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
    "cargoHolds": [{ "capacity": 800, "allowedCargo": null }],
    "travelTime": 1853,
    "antimatterCost": 1,
    "antimatterAvailable": 0,
    "maxRange": 593.75,
    "tankerBonus": 0,
    "inRange": true,
    "hasDamagedShips": false,
    "garrisonFuelPerHour": 1,
    "usingJumpRoute": false,
    "highway": null,
    "stationConstraints": null
}
```

### Important Notes
- The endpoint evaluates if there is enough fuel currently available on the planet (`sufficient`).
- Calculates distance precisely (to the target planet when `targetPlanetId` is used).
- Accounts for tech bonuses (`fuelBonus`).
- Also calculates total effective cargo capacity (`totalCargoCapacity`, per-hold in `cargoHolds`), which is useful to ensure the fleet can carry the required load.
- `highway` / `stationConstraints` were `null` on every probe (no highway on the tested routes).
- Rate limit: 40 per 10 s, 120 per minute.
- On the game's protected-endpoint list (Dynamic API transport). Plain calls work while that flag is off.
- Related, not replacements: `/fleet/patrol/fuel-estimate` (patrols, by `durationHours` + `coverage`), `/fleet/mining-fleet-operation-estimate` (field attack/defence), `/moons/{id}/send-estimate`, `/stations/{id}/dispatch-estimate`.

## Live Verification

- Verified 2026-10-09 on `s0`: `POST /api/fleet/fuel-estimate` -> `200` for system-, planet- and option-variant payloads above.
