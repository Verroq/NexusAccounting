# /api/auth/me

This endpoint returns the currently authenticated user's profile and colonized planets.

## Payload Structure

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
            "storageBonus": 0.15
        },
        "diplomatDoctrine": null,
        "pendingDoctrine": null,
        "doctrineActiveAt": null,
        "genesisCode": "ABCDEF",
        "precursorFragments": 15,
        "createdAt": "2026-01-01T12:00:00.000Z",
        "lastLoginAt": "2026-06-20T10:00:00.000Z",
        "starterBoostUntil": null,
        "isAdmin": false,
        "commandCenterActive": true,
        "commandCenterExpiresAt": "2026-07-20T10:00:00.000Z",
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
        "steamId": "12345678901234567",
        "steamAvatarUrl": "https://avatars.steamstatic.com/random_avatar_full.jpg",
        "marketingEmailsOptIn": false
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

### Important Notes
- The `id` field within `user` maps to the `userId` in the web application's internal model (e.g. from the JWT token). When parsing `getUserProfile()`, ensure you handle both the `/api/auth/me` structure and the standard JWT extension token structure.
- The `planets` array provides a comprehensive list of all colonies owned by the player, including their exact coordinates and system names.
