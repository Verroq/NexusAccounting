# /api/fleet/xeno-survey

Dispatches a xeno/ancient moon survey mission.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 35572,
  "targetMoonId": 49793,
  "ships": [
    { "shipDefId": 1, "quantity": 1 }
  ]
}
```

## Response Structure

```json
{
  "mission": {}
}
```

## Notes

- Request fields confirmed from addon `SEND_XENO_SURVEY` code path.
- Safe invalid probe on `s0` returned `400 VALIDATION_ERROR`.
