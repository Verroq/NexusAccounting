# /api/stations/{stationId}/send

Dispatches a fleet mission at a station. Withdrawing and depositing resources are missions, not
instant transfers: haulers fly from one of your planets to the station and back.

## Method

`POST`

## Request Body

Collect (withdraw from the station):

```json
{
  "sourcePlanetId": 4021,
  "missionType": "collect_station",
  "ships": [{ "shipDefId": 7, "quantity": 12 }],
  "collectCargo": { "ore": 40000, "plasma_core": 500 },
  "attachLeader": true
}
```

Supply (deposit into the station):

```json
{
  "sourcePlanetId": 4021,
  "missionType": "supply_station",
  "ships": [{ "shipDefId": 7, "quantity": 12 }],
  "cargo": { "ore": 21000, "silicates": 0, "hydrogen": 0, "alloys": 0 },
  "attachLeader": true
}
```

Garrison (send ships to a station your alliance owns):

```json
{
  "sourcePlanetId": 4021,
  "missionType": "garrison_station",
  "ships": [{ "shipDefId": 21, "quantity": 40 }],
  "attachLeader": true
}
```

## Notes

- Deploy mission types, as the official client picks them: `garrison_station`
  when your alliance owns the station, `defend_station` when your alliance is the
  one capturing it (or is the defender in an active capture operation), and
  `attack_station` otherwise. Garrisoned ships dock at the station; which of them
  stand as active orbital defence is a separate step,
  `PUT /api/stations/{id}/defense-roster` with
  `{ selections: [{ garrisonId, quantity }] }`, capped by command points.
- `POST /api/stations/{id}/recall` with `{ targetPlanetId, ships, recallLeadershipVessel }`
  brings a garrison home.
- `collectCargo` takes any station resource, in snake_case keys (`cryo_ice`, `quantum_dust`,
  `plasma_core`, `bio_extract`, `dark_matter`, `antimatter` alongside the four basics).
- `cargo` (supply) carries **the four basic resources only** — a supply mission has no rare slots.
- The same endpoint carries the combat missions (`attack_station`, with `isCombinedAssault`,
  `forcePactBreak`, `forceShieldBreak`, `hangarAssignments`) — out of scope here.
- Cargo beyond the fleet's capacity is rejected by the server; the addon checks capacity from the
  ship definitions first.
- Fuel comes from the usual `POST /api/fleet/fuel-estimate`, not a station-specific endpoint.

## Source

- Bodies read from the official client bundle (`StationPage-*.js`, 2026-09-09). Not probed live —
  a POST would dispatch a real fleet.
