# /api/combat-simulator/bootstrap

Returns everything the in-game combat simulator needs to build a battle: every player and NPC ship stat line, which ship ids count as pirates, the selectable pirate zones, and the caller's own bonus availability.

## Method

`GET`

## Response Structure

```json
{
  "ownProfile": {
    "bonusesAvailable": true,
    "carrierOperationsLevel": 1,
    "leadership": {
      "available": true,
      "name": "Ika (Leadership Vessel)",
      "currentHull": 659,
      "maxHull": 1242,
      "shield": 163,
      "attack": 285
    }
  },
  "playerShips": [
    {
      "id": 1,
      "key": "probe",
      "name": "Probe",
      "hp": 30,
      "shieldHp": 8,
      "attack": 0,
      "weaponType": null,
      "armorType": "light",
      "shipSize": "small",
      "shipClass": "recon",
      "imageKey": "probe",
      "reportKey": "probe",
      "sortOrder": 1,
      "isNpc": false
    }
  ],
  "npcShips": [
    {
      "id": -10001,
      "key": "scout",
      "name": "Pirate Scout",
      "hp": 100,
      "shieldHp": 0,
      "attack": 15,
      "weaponType": "kinetic",
      "armorType": "light",
      "shipSize": "small",
      "shipClass": "combat",
      "imageKey": "scout",
      "reportKey": "wormhole_pirate_scout",
      "sortOrder": 9000,
      "isNpc": true
    }
  ],
  "pirateShipIds": [
    4
  ],
  "pirateZones": [
    "sentinel"
  ]
}
```

## Notes

- `playerShips[]` / `npcShips[]` carry the raw combat stats (`hp`, `shieldHp`, `attack`, `weaponType`, `armorType`, `shipSize`, `shipClass`), so this is a single-call source of truth for ship balance data.
- `pirateShipIds` is the subset of `npcShips` usable when a side has `type: "pirate"`.
- `pirateZones` are the valid values for `pirateZone` in the simulate payload.
- `ownProfile.bonusesAvailable` gates the client's "load my bonuses" toggle; `ownProfile.leadership` describes the command vessel that `attachLeadership` would add.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/combat-simulator/bootstrap` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `npcShips`=14, `pirateShipIds`=7, `pirateZones`=4, `playerShips`=33.
