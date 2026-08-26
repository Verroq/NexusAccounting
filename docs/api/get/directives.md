# /api/directives

Returns the player's directive (quest) progress, completed directive keys, and the journal.

## Method

`GET`

## Response Structure

```json
{
  "directives": [
    {
      "key": "leadership_mining_escort",
      "step": "completed",
      "stepStartedAt": "2026-07-29T13:22:28.195Z",
      "stepEndsAt": null,
      "updatedAt": "2026-07-29T13:22:28.195Z",
      "payload": {
        "targetFieldId": 270909,
        "targetSystemId": 632,
        "miningMissionId": 7910697,
        "triggerPlanetId": 42432,
        "requiresDeadPlanetOrigin": false,
        "hideoutRequiresDeadPlanetOrigin": false,
        "anomalyRequiresDeadPlanetOrigin": false,
        "baseRequiresDeadPlanetOrigin": false
      }
    }
  ],
  "completedKeys": [
    "extraction_network_1"
  ],
  "journalEnabled": true,
  "journal": [
    {
      "key": "extraction_network_1",
      "step": "completed",
      "stepStartedAt": "2026-06-06T01:06:35.369Z",
      "stepEndsAt": null,
      "updatedAt": "2026-06-06T01:06:35.369Z",
      "payload": {
        "requiresDeadPlanetOrigin": false,
        "hideoutRequiresDeadPlanetOrigin": false,
        "anomalyRequiresDeadPlanetOrigin": false,
        "baseRequiresDeadPlanetOrigin": false
      }
    }
  ]
}
```

## Notes

- `directives[].step` is the current step key, `completed` when finished.
- `payload` carries directive-specific context (target ids, mission ids) and its shape varies per directive key.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/directives` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `completedKeys`=23, `directives`=12, `journal`=23.
