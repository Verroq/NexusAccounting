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
        "id": 1234,
        "username": "RandomCommander",
        "email": "steam-12345678901234567@noreply.nexuslegacy.space",
        "race": "terran",
        "leaderType": "industrialist",
        "activeLeaderBonuses": {
            "oreProductionBonus": 0.12,
            "silicateProductionBonus": 0.12,
            "hydrogenProductionBonus": 0.08,
            "alloysProductionBonus": 0.08,
            "miningYieldBonus": 0.1,
            "storageBonus": 0.15,
            "cargoBonus": 0.1
        },
        "genesisCode": "ABCDEF",
        "precursorFragments": 15,
        "createdAt": "2026-01-01T12:00:00.000Z",
        "lastLoginAt": "2026-06-20T10:00:00.000Z",
        "isAdmin": false,
        "commandCenterActive": true,
        "commandCenterExpiresAt": "2026-07-20T10:00:00.000Z",
        "preferredLanguage": "en",
        "steamId": "12345678901234567",
        "steamAvatarUrl": "https://avatars.steamstatic.com/random_avatar_full.jpg",
        "marketingEmailsOptIn": false,
        "diplomatDoctrine": null,
        "pendingDoctrine": null,
        "doctrineActiveAt": null,
        "starterBoostUntil": null,
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
        "traderSummonUses": 0
    },
    "planets": [
        {
            "id": 99999,
            "name": "Random's Homeworld",
            "systemId": 8888,
            "position": 3,
            "planetType": "terra",
            "isHomeworld": true,
            "systemName": "A1-1",
            "colonizedAt": "2026-01-01T12:00:00.000Z",
            "systemX": 100.1234,
            "systemY": -200.5678
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
