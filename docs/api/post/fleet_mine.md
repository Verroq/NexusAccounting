# /api/fleet/mine

Dispatches ships to mine an asteroid field.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 32268,
  "targetFieldId": 3597,
  "ships": [
    { "shipDefId": 26, "quantity": 2 }
  ],
  "miningDuration": 600,
  "hangarAssignments": {},
  "mineUntilFull": true
}
```

With the leadership vessel attached (confirmed live, leader ship is `shipDefId` 29 here and is
listed in `ships` like any other hull):

```json
{
  "sourcePlanetId": 92841,
  "targetFieldId": 1126390,
  "ships": [
    { "shipDefId": 4, "quantity": 37 },
    { "shipDefId": 21, "quantity": 57 },
    { "shipDefId": 29, "quantity": 1 }
  ],
  "miningDuration": 600,
  "attachLeader": true,
  "hangarAssignments": {},
  "mineUntilFull": true
}
```

## Response Structure

```json
{
  "missionId": 11753056
}
```

## Fields

- `sourcePlanetId` — planet the fleet departs from.
- `targetFieldId` — asteroid field to mine.
- `ships` — `[{ shipDefId, quantity }]`.
- `miningDuration` — seconds spent mining on site. The client defaults this to `600` when unset.
- `hangarAssignments` — optional, carrier hangar loadout; `{}` when unused.
- `mineUntilFull` — optional boolean. **"Mine until cargo is full"**: continue beyond the normal
  10 cycles until the mining hold is full or the field is depleted. Omit or `false` for a
  fixed-length run.
- `escortRetreatThreshold` — optional, retreat threshold for the combat escort.
- `attachLeader` — optional boolean. `true` attaches the leader to the mission so the leadership
  vessel travels with the fleet (its hull still appears in `ships` with `quantity: 1`). Omit or
  `false` to leave the leader home. Not mine-specific: every fleet mission endpoint accepts it.

## Notes

- Confirmed live: the request example above returned `{"missionId": 11753056}`.
- The official client reads an optional `mission` object off this response and prepends it to its
  cached mission list, so a full mission object may also be returned; the `missionId` field is what
  was observed.
- The same `mineUntilFull`, `hangarAssignments`, `attachLeader` and `miningDuration` options apply
  to `POST /api/outposts/{outpostId}/dispatch-mining`, which mines from an outpost instead of a
  planet.
- Field parity between this endpoint and the client's `dispatchMiningFleet` call was verified
  against the game client bundle.
