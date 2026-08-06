# /api/fleet/mine

Dispatches ships to mine an asteroid field.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "targetFieldId": 11748,
  "ships": [
    { "shipDefId": 6, "quantity": 60 }
  ],
  "miningDuration": 3600
}
```

## Response Structure

```json
{
  "mission": {}
}
```

## Notes

- Request fields confirmed from addon `SEND_MINE` code path.
- Safe invalid probe on `s0` returned `400 VALIDATION_ERROR`.
