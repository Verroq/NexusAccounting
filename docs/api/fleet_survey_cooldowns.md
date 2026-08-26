# /api/fleet/survey-cooldowns

Returns the last survey time and cooldown end time for systems relevant to the player.

## Method

`GET`

## Response Structure

```json
{
  "cooldowns": [
    {
      "systemId": 4609,
      "lastSurveyAt": "2026-08-26T07:39:19.215Z",
      "cooldownEndsAt": "2026-08-26T11:39:19.215Z"
    }
  ],
  "dailySurveyCount": 11
}
```

## Notes

- Confirmed from the API client wrapper types.
- Useful for automation to avoid wasting probe missions on active cooldowns.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/survey-cooldowns` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `cooldowns`=11.
