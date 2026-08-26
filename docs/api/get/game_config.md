# /api/game-config

Returns the universe speed multipliers for the current universe. Reachable with a lobby token as well as a game token, so it can be read before a per-universe session exists.

## Method

`GET`

## Response Structure

```json
{
  "universeKey": "s0",
  "gameSpeed": 1,
  "fleetSpeed": 1,
  "miningSpeed": 1
}
```

## Notes

- `gameSpeed`, `fleetSpeed`, `miningSpeed` are multipliers applied server-side; ETA and cooldown math should scale with them instead of assuming 1.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/game-config` -> `200`.
- Example above is a real response with every array truncated to its first item.
