# /api/galaxy/systems/{systemId}/planets

Returns all scannable entities in a system: planets, asteroid fields, and moons.

## Method

`GET`

## Observed Response Shape

```json
{
  "planets": [
    {
      "id": 29922,
      "name": "A12-27-P1",
      "position": 1,
      "planetType": "volcanic",
      "size": 109,
      "temperature": 358,
      "userId": null,
      "isHomeworld": false,
      "colonizedAt": null,
      "shieldReinforcedUntil": null,
      "ownerName": null,
      "ownerRace": null,
      "ownerAvatarUrl": null,
      "ownerAllianceTag": null,
      "ownerPortraitFrame": null,
      "ownerIsVacationMode": false,
      "deadSpaceShieldActive": false
    }
  ],
  "asteroidFields": [],
  "moons": [
    {
      "id": 41772,
      "planetId": 29923,
      "name": "World 29923-a",
      "moonType": "barren",
      "size": 35,
      "position": 1,
      "buildingSlots": 6,
      "userId": null,
      "colonizedAt": null,
      "ownerName": null,
      "ownerAvatarUrl": null,
      "ownerIsVacationMode": false
    }
  ],
  "visibility": "full",
  "included": {
    "planets": true,
    "moons": true,
    "fields": true
  },
  "planetCount": null,
  "hasCivilization": null
}
```

## Notes

- Confirmed as a multi-entity payload by the map interception logic.
- The addon stores `planets`, `asteroidFields`, and `moons` separately.
- This is one of the richest discovery endpoints in the game surface used by the addon.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/galaxy/systems/577/planets` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `moons`=7, `planets`=6.
- `asteroidFields` is empty for system 577; the array is populated for systems that have fields. `included` flags which of `planets` / `moons` / `fields` the response actually resolved.
