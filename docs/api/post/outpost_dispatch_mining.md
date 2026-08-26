# /api/outposts/{outpostId}/dispatch-mining

Sends ships already garrisoned at an outpost to mine that outpost's asteroid field. This is the
outpost-side counterpart of [fleet_mine.md](./fleet_mine.md): there is no `sourcePlanetId`, because
the fleet comes from the outpost's own garrison rather than from a planet.

## Method

`POST`

## Request Structure

```json
{
  "targetFieldId": 3597,
  "ships": [
    { "shipDefId": 26, "quantity": 2 }
  ],
  "miningDuration": 6000,
  "hangarAssignments": {},
  "mineUntilFull": true
}
```

## Response Structure

```json
{
  "mission": {}
}
```

## Fields

- `targetFieldId` — the asteroid field to mine. The client only offers outposts whose
  `asteroidField.id` matches the field being targeted, so in practice this is the field the outpost
  already sits on (`outposts[].asteroidField.id` in [outposts.md](../get/outposts.md)).
- `ships` — `[{ shipDefId, quantity }]`, drawn from the outpost's `garrison`, not from a planet
  fleet. An outpost with an empty `garrison` cannot be used.
- `miningDuration` — seconds spent mining. **The client default here is `6000`**, unlike
  `/api/fleet/mine` where it is `600`.
- `hangarAssignments` — optional, carrier hangar loadout; `{}` when unused.
- `mineUntilFull` — optional boolean. "Mine until cargo is full": continue beyond the normal 10
  cycles until the mining hold is full or the field is depleted.
- `attachLeader` — optional boolean, sends the leadership vessel along.

## Notes

- Which ships may mine depends on the field type:

```text
ore      miner, freighter, salvaged_freighter, excavator
ice      ice_drill, excavator
gas      gas_collector, excavator
quantum  gas_collector, excavator
plasma   miner, excavator
dark     ice_drill, excavator
```

- Before dispatching, the client fetches `GET /api/outposts/{outpostId}/mining-cargo-preview` to
  show the effective cargo bonus. That endpoint is live-verified (`200`) and returns:

```json
{
  "baseCargoBonus": 0.4,
  "attachedCargoBonus": 0.4,
  "attachedCargoFlatBonus": 0
}
```

- It also fetches `GET /api/leadership` in the same modal, to offer `attachLeader`.
- The resulting mission appears in [fleet_missions.md](../get/fleet_missions.md) and its report in
  [fleet_mining_reports.md](../get/fleet_mining_reports.md).

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
