# /api/auth/me

Returns the currently authenticated player account plus a compact list of the
player's colonized planets.

## Method

`GET`

## Authentication

- Requires a logged-in game session.
- Called with browser credentials (`credentials: include`) in addon fetch code.
- Returns 401 when the session is missing or expired.

## Query Parameters

None.

## Response Structure

```json
{
  "user": {
    "id": 428,
    "username": "Verrok",
    "email": "verrokcsgo@gmail.com",
    "race": "terran",
    "leaderType": "explorer",
    "activeLeaderBonuses": {
      "expeditionLootBonus": 0.25,
      "surveyLootBonus": 0.15,
      "wormholeLootBonus": 0.2,
      "artifactDropBonus": 0.25,
      "shipSpeedBonus": 0.1,
      "fuelCostBonus": 0.15,
      "cargoBonus": 0.1,
      "oreProductionBonus": 0.1,
      "silicateProductionBonus": 0.1,
      "hydrogenProductionBonus": 0.1,
      "alloysProductionBonus": 0.1,
      "popGrowthBonus": 0.2,
      "workforceProductionBonus": 0.03
    },
    "diplomatDoctrine": null,
    "pendingDoctrine": null,
    "doctrineActiveAt": null,
    "genesisCode": "ZU9XR7",
    "precursorFragments": 19,
    "createdAt": "2026-06-06T00:41:29.497Z",
    "lastLoginAt": "2026-08-26T09:19:42.281Z",
    "starterBoostUntil": null,
    "isAdmin": false,
    "commandCenterActive": false,
    "commandCenterExpiresAt": "2026-08-22T09:52:57.630Z",
    "preferredLanguage": "en",
    "lastLeaderChangeAt": null,
    "privateMessagesMutedUntil": null,
    "privateMessagesMuteReason": null,
    "vacationStartedAt": null,
    "vacationUntil": null,
    "vacationMinUntil": null,
    "vacationNextAvailableAt": null,
    "profileDeletionRequestedAt": null,
    "profileDeletionScheduledAt": null,
    "leaderChangeUses": 0,
    "traderSummonUses": 0,
    "steamId": null,
    "steamAvatarUrl": null,
    "marketingEmailsOptIn": false
  },
  "planets": [
    {
      "id": 29925,
      "name": "Terra",
      "systemId": 577,
      "position": 4,
      "planetType": "terra",
      "isHomeworld": true,
      "systemName": "A12-27",
      "colonizedAt": "2026-06-06T00:41:29.508Z",
      "sortOrder": 0,
      "systemX": -238.32376,
      "systemY": 636.6574,
      "securityZone": "sentinel"
    }
  ]
}
```

## Field Notes

- `user.id` is the canonical logged-in player identifier.
- `planets` is intentionally lightweight and focused on colony identity/location
    fields rather than full economy/fleet state.
- `planets[].systemX` and `planets[].systemY` are used for distance calculations
    in galaxy tooling.
- `activeLeaderBonuses` is sparse and bonus keys can vary by current leader.

## Addon Usage Notes

- Finder tab:
    - Uses `user.id` for ownership filtering.
    - Uses `planets[].systemX/systemY` and `planets[].systemName` for origin pickers
        and distance calculations.
- Logistics/Quartermaster:
    - Uses `user.id` (and fallback `user.userId` when present) to identify owned
        moons in system payloads.
    - Uses `activeLeaderBonuses.cargoBonus` to compute effective cargo capacity.

## Compatibility Notes

- Treat `user.id` as equivalent to `userId` used in other endpoint payloads and
    internal models.
- Consumer code should tolerate nullable account-state fields (vacation,
    doctrine, moderation, deletion schedule).

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/auth/me` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `planets`=6.
- `user.activeLeaderBonuses` only lists the bonuses of the currently equipped leader, so its key set varies between accounts and over time.
