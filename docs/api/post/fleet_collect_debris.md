# /api/fleet/collect-debris

Dispatches a mission to harvest a debris field.

## Method

`POST`

## Request Structure

```json
{
  "sourcePlanetId": 74062,
  "debrisId": 87906,
  "ships": [
    {
      "shipDefId": 6,
      "quantity": 50
    }
  ]
}
```

## Response Structure

```json
{
  "mission": 1899003
}
```

## Notes

- Confirmed from the API client wrapper.
- Typically used together with `/api/fleet/system-debris` and `/api/fleet/fuel-estimate`.