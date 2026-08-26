# /api/fleet/mine-reports

Returns reports for mines triggered on a planet (defensive mine detonations), including fleet before/after composition.

## Method

`GET`

## Response Structure

```json
{
  "reports": [
    {
      "id": 1644,
      "mineOwnerId": 5775,
      "fleetOwnerId": 428,
      "planetOwnerId": 5775,
      "planetId": 70871,
      "missionId": 6092305,
      "fleetBefore": [
        {
          "quantity": 231,
          "shipDefId": 4
        }
      ],
      "fleetAfter": [
        {
          "quantity": 230,
          "shipDefId": 4
        }
      ],
      "losses": [
        {
          "key": "scout",
          "name": "Scout",
          "destroyed": 1,
          "shipDefId": 4
        }
      ],
      "minesTriggered": 10,
      "minesNeutralized": 0,
      "stealthShipsPresent": 0,
      "minesRemaining": 0,
      "outcome": "partial_losses",
      "debrisField": {
        "ore": 1290,
        "alloys": 186,
        "silicates": 660
      },
      "readByMineOwner": true,
      "readByFleetOwner": true,
      "createdAt": "2026-07-18T20:28:34.745Z",
      "planetName": "Roter Oktober",
      "systemName": "G45-35",
      "mineOwnerName": "Braxon",
      "fleetOwnerName": "Verrok",
      "perspective": "fleet_owner",
      "isRead": true,
      "isSaved": false
    }
  ],
  "unreadCount": 0
}
```

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/mine-reports` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `reports[].fleetAfter`=5, `reports[].fleetBefore`=5, `reports[].losses`=3.
