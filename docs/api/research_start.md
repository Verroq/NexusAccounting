# /api/research/{researchId}/start

Starts a research job on a selected planet.

## Method

`POST`

## Request Structure

```json
{
  "planetId": 35572,
  "useFragments": true
}
```

`useFragments` is optional.

## Response Structure

```json
{
  "ok": true
}
```

## Notes

- Endpoint path and request body confirmed from addon `startResearch` implementation.
- Safe invalid probe (`/api/research/-1/start`) on `s0` returned `400` with validation error payload (`error`, `details`).
