# /api/fleet/expedition

Starts an expedition mission.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "ships": [
    { "shipDefId": 1, "quantity": 1 }
  ],
  "zone": "sentinel",
  "depth": 1
}
```

## Response Structure

```json
{
  "mission": {}
}
```

## Notes

- Request fields confirmed from addon `SEND_EXPEDITION` code path.
- Safe invalid probe on `s0` returned `400 VALIDATION_ERROR`.
