# /api/fleet/artifact-transfer

Sends a fleet carrying one artifact from one owned planet to another. This is the only way to move an artifact between planets.

## Method

`POST`

## Request Body

```json
{
  "sourcePlanetId": 29925,
  "targetPlanetId": 32268,
  "artifactId": 38108,
  "ships": [
    { "shipDefId": 4, "quantity": 1 }
  ]
}
```

## Response Structure

```json
{}
```

## Notes

- Creates a normal fleet mission, so the result shows up in [fleet_missions.md](./fleet_missions.md).

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
