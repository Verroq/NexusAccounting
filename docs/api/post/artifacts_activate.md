# /api/artifacts/{artifactId}/activate

Activates an artifact, paying its activation cost and starting its effect timer.

## Method

`POST`

## Request Body

```json
{
  "planetId": 29925
}
```

## Response Structure

```json
{}
```

## Notes

- `planetId` is the planet that pays the activation cost. A `global`-scope artifact still needs one.
- Costs and duration come from `definition.activationCost*` / `activationTime` / `duration` in [artifacts.md](../get/artifacts.md).

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
