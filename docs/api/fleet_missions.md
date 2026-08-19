# /api/fleet/missions

This endpoint returns the currently authenticated user's active and returning fleet missions, as well as the maximum number of fleet slots available to them.

## Payload Structure

```json
{
    "missions": [
        {
            "id": 1898256,
            "userId": 5494,
            "sourcePlanetId": 74062,
            "targetPlanetId": null,
            "targetFieldId": null,
            "targetStationId": null,
            "missionType": "survey",
            "status": "surveying",
            "fleetComposition": [
                {
                    "quantity": 1,
                    "shipDefId": 1,
                    "shipName": "Probe",
                    "shipKey": "probe"
                }
            ],
            "distance": 230.89154,
            "speed": 29,
            "travelTime": 481,
            "cargo": {},
            "departsAt": "2026-06-24T00:59:07.330Z",
            "arrivesAt": "2026-06-24T01:07:08.330Z",
            "returnDepartsAt": "2026-06-24T01:19:10.106Z",
            "returnArrivesAt": null,
            "createdAt": "2026-06-24T00:59:07.331Z",
            "sourcePlanetName": "Helfull's Homeworld",
            "targetPlanetName": null,
            "targetFieldType": null,
            "sourceSystemId": 9707,
            "targetSystemId": 5711,
            "sourceSystemName": "A2-30",
            "targetSystemName": "A2-27",
            "raidParams": null,
            "patrolCoverage": null,
            "patrolMode": null,
            "patrolCapacityUsed": 0,
            "isProbeFleet": true,
            "miningEfficiencyPercent": null
        },
        {
            "id": 1893364,
            "userId": 5494,
            "sourcePlanetId": 74062,
            "targetPlanetId": null,
            "targetFieldId": 11748,
            "targetStationId": null,
            "missionType": "mine",
            "status": "mining",
            "fleetComposition": [
                {
                    "quantity": 60,
                    "shipDefId": 6,
                    "shipName": "Interceptor",
                    "shipKey": "interceptor"
                },
                {
                    "quantity": 20,
                    "shipDefId": 27,
                    "shipName": "Gas Collector",
                    "shipKey": "gas_collector"
                }
            ],
            "distance": 154.3565,
            "speed": 6,
            "travelTime": 1610,
            "cargo": {
                "hydrogen": 990,
                "_raidDone": 1,
                "_cyclesDone": 5,
                "_nextCycleAt": "2026-06-24T01:17:48.418Z",
                "_cycleStartedAt": "2026-06-24T01:07:48.418Z"
            },
            "departsAt": "2026-06-23T23:50:47.036Z",
            "arrivesAt": "2026-06-24T00:17:37.036Z",
            "returnDepartsAt": null,
            "returnArrivesAt": null,
            "createdAt": "2026-06-23T23:50:47.037Z",
            "sourcePlanetName": "Helfull's Homeworld",
            "targetPlanetName": "G21-50-AF1",
            "targetFieldType": "ore",
            "sourceSystemId": 9707,
            "targetSystemId": 5750,
            "sourceSystemName": "G21-30",
            "targetSystemName": "G21-50",
            "raidParams": null,
            "patrolCoverage": null,
            "patrolMode": null,
            "patrolCapacityUsed": 0,
            "isProbeFleet": false,
            "miningEfficiencyPercent": 95
        }
    ],
    "maxFleetSlots": 9
}
```

### Important Notes
- The `missions` array contains all currently active fleets, including those dispatched, working (mining, surveying, patrolling), and returning.
- The `maxFleetSlots` determines how many total active fleets a user is permitted to maintain simultaneously. This depends on their underlying research and technologies.
- Used fleet slots can be computed locally by checking `missions.filter(m => !['completed', 'recalled', 'failed'].includes(m.status.toLowerCase())).length`.
- `targetFieldType` — resource type of the asteroid field being mined (e.g. `"ore"`, `"hydrogen"`); `null` for non-mining missions.
- `sourceSystemName` / `targetSystemName` — human-readable system names for display; were not present in the original documented schema.
- `miningEfficiencyPercent` — effective mining efficiency at the time of dispatch (0–100+); `null` for non-mining missions.
