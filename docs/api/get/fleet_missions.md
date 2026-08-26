# /api/fleet/missions

This endpoint returns the currently authenticated user's active and returning fleet missions, as well as the maximum number of fleet slots available to them.

## Payload Structure

```json
{
  "missions": [
    {
      "id": 11749398,
      "userId": 428,
      "sourcePlanetId": 42432,
      "sourceMoonId": null,
      "sourceOutpostId": null,
      "sourceStationId": null,
      "targetPlanetId": 92841,
      "targetMoonId": null,
      "targetFieldId": null,
      "targetFleetMissionId": null,
      "targetStationId": null,
      "targetSectorId": null,
      "missionType": "deliver",
      "status": "outbound",
      "fleetComposition": [
        {
          "quantity": 2,
          "shipDefId": 24,
          "shipName": "Bulk Carrier",
          "shipKey": "bulk_carrier"
        }
      ],
      "hangarAssignments": null,
      "distance": 191.85808,
      "speed": 8,
      "travelTime": 1334,
      "cargo": {
        "alloys": 6554
      },
      "departsAt": "2026-08-26T09:11:54.185Z",
      "arrivesAt": "2026-08-26T09:34:08.185Z",
      "returnDepartsAt": null,
      "returnArrivesAt": null,
      "createdAt": "2026-08-26T09:11:54.178Z",
      "sourcePlanetName": "Negi's Mom Geisha Balls",
      "targetPlanetName": "Silly Cat",
      "targetFieldType": null,
      "sourceSystemId": 4652,
      "targetSystemId": 6441,
      "sourceSystemName": "B47-2",
      "targetSystemName": "G35-41",
      "raidParams": null,
      "patrolCoverage": null,
      "patrolMode": null,
      "patrolCapacityUsed": 0,
      "isProbeFleet": false,
      "miningEfficiencyPercent": null,
      "leadershipVessel": null
    }
  ],
  "maxFleetSlots": 17
}
```

### Important Notes
- The `missions` array contains all currently active fleets, including those dispatched, working (mining, surveying, patrolling), and returning.
- The `maxFleetSlots` determines how many total active fleets a user is permitted to maintain simultaneously. This depends on their underlying research and technologies.
- Used fleet slots can be computed locally by checking `missions.filter(m => !['completed', 'recalled', 'failed'].includes(m.status.toLowerCase())).length`.
- `targetFieldType` — resource type of the asteroid field being mined (e.g. `"ore"`, `"hydrogen"`); `null` for non-mining missions.
- `sourceSystemName` / `targetSystemName` — human-readable system names for display; were not present in the original documented schema.
- `miningEfficiencyPercent` — effective mining efficiency at the time of dispatch (0–100+); `null` for non-mining missions.

## Live Verification

- Verified 2026-08-26 on `s0`: `GET /api/fleet/missions` -> `200`.
- Example above is a real response with every array truncated to its first item.
- Live array sizes at capture time: `missions`=17.
