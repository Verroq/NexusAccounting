# /api/fleet/pirate-camps

Returns the visible pirate camp list with health, loot tier, and scouting intel.

## Method

`GET`

## Response Structure

```json
{
  "camps": [
    {
      "id": 4401,
      "systemId": 5750,
      "systemName": "G21-50",
      "tier": "corsair",
      "name": "Corsair Hideout",
      "currentHpPercent": 72,
      "lootTier": "rare",
      "destroyedAt": null,
      "respawnsAt": null,
      "fleetComposition": [],
      "fleetIntel": [],
      "hasFleetIntel": false,
      "lastScoutedAt": null,
      "scoutHpPercent": null,
      "scoutTierData": null
    }
  ]
}
```

## Notes

- Confirmed from the `PirateCamp` model and the consuming view.
- The addon caches and displays both active and destroyed camps.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/pirate-camps` -> `200`.
- Live response was empty on the sweep account; the example above is kept as the documented shape.
