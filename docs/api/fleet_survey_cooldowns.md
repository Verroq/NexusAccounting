# /api/fleet/survey-cooldowns

Returns the last survey time and cooldown end time for systems relevant to the player.

## Method

`GET`

## Response Structure

```json
{
  "cooldowns": [
    {
      "systemId": 5752,
      "lastSurveyAt": "2026-07-13T10:00:00.000Z",
      "cooldownEndsAt": "2026-07-13T12:00:00.000Z"
    }
  ]
}
```

## Notes

- Confirmed from the API client wrapper types.
- Useful for automation to avoid wasting probe missions on active cooldowns.