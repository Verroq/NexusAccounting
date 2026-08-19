# /api/galaxy/arms/{armId}/sectors

Returns sectors belonging to a specific galaxy arm.

## Method

`GET`

## Response Structure

```json
{
  "sectors": [
    {
      "id": 21,
      "armId": 3,
      "index": 0,
      "name": "Sector 1",
      "controllerAllianceId": null,
      "controlledSince": null,
      "systemCount": 50,
      "colonizedPlanets": 18,
      "visibility": "full",
      "securityZone": "gray"
    }
  ]
}
```

## Notes

- Confirmed from the `Sector` TypeScript model.
- Used to decorate systems with sector names and to schedule station sync per sector.