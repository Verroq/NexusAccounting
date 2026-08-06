# /api/fleet/survey-reports

Returns the authenticated player's survey results and follow-up opportunities.

## Method

`GET`

## Response Structure

```json
{
  "reports": [
    {
      "id": 555001,
      "missionId": 1898256,
      "userId": 1234,
      "systemId": 5752,
      "eventType": "loot",
      "eventTitle": "Wreckage Located",
      "eventDescription": "Sensors found salvageable wreckage.",
      "loot": { "ore": 1200 },
      "uncollectedLoot": { "ore": 1200 },
      "salvageExpiresAt": "2026-07-13T16:00:00.000Z",
      "shipsLost": [],
      "shipsDamaged": [],
      "surveyDuration": 481,
      "securityZone": "gray",
      "combatLog": null,
      "investigated": false,
      "anomalyExpiresAt": null,
      "wormholesDetected": 0,
      "isRead": false,
      "createdAt": "2026-07-13T12:08:00.000Z",
      "systemName": "G21-52",
      "systemX": 345.12,
      "systemY": -519.7,
      "isSaved": false
    }
  ]
}
```

## Notes

- Confirmed from the `SurveyReport` model.
- This endpoint exposes loot, anomaly state, combat details, and follow-up timers in a single feed.