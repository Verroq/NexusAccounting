# /api/artifacts/{artifactId}/transcend

Transcends an artifact, upgrading it at the cost of the source artifact.

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

## Live Verification

- Not probed (POST is mutating and the 2026-08-26 sweep was read-only).
- Path, verb and request body were extracted from the official game client bundle
  (`/assets/*.js`), so they match what the game itself sends. The response shape is
  inferred from how the client consumes the reply and is marked as such.
