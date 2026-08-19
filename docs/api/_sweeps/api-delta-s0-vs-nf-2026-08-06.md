# API Delta Report (s0 vs nf)

Generated: 2026-08-06

- s0 base: https://s0.nexuslegacy.space
- nf base: https://nf.nexuslegacy.space

## Endpoints with differences

| Endpoint | s0 status | nf status | s0 keys | nf keys | s0 message | nf message |
|---|---:|---:|---|---|---|---|
| /api/command-center/fleet-templates | 200 | 200 | 0,1,2,3,4 |  |  |  |
| /api/fleet/system-debris?systemId=2831 |  | 200 |  | debris |  |  |
| /api/fleet/system-debris?systemId=80 | 200 |  | debris |  |  |  |
| /api/galaxy/systems/2831/planets |  | 200 |  | planets,asteroidFields,moons,visibility,included,planetCount,hasCivilization |  |  |
| /api/galaxy/systems/80/planets | 200 |  | planets,asteroidFields,moons,visibility,included,planetCount,hasCivilization |  |  |  |
| /api/market/my-balances | 200 | 403 | balances | error,code |  | Research Market Access to unlock trading |
| /api/market/my-trades | 200 | 403 | 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39 | error,code |  | Research Market Access to unlock trading |
| /api/market/orders?page=1&limit=25 | 200 | 403 | orders,pagination | error,code |  | Research Market Access to unlock trading |
| /api/planets/1819 |  | 200 |  | planet,serverNow,deadSpaceShieldEnabled,resourceSnapshot,systemInfo,productionBreakdown,productionMultiplier,starterProductionMultiplier,buildSpeedMult,buildQueueCount,buildQueueMax,buildings |  |  |
| /api/planets/1819/fleet |  | 200 |  | fleet,cargoBonus,shuttleCargoBonus,resourceSnapshot,resources |  |  |
| /api/planets/1819/shipyard |  | 200 |  | ships,shipSpeedMult,orbitalShipSpeedMult,shipScrapSpeedMult,orbitalShipScrapSpeedMult,planetaryQueue,orbitalQueue,planetaryQueueAll,orbitalQueueAll,planetaryQueueCount,orbitalQueueCount,maxQueueSize |  |  |
| /api/planets/35572 | 200 |  | planet,serverNow,deadSpaceShieldEnabled,resourceSnapshot,systemInfo,productionBreakdown,productionMultiplier,starterProductionMultiplier,buildSpeedMult,buildQueueCount,buildQueueMax,buildings |  |  |  |
| /api/planets/35572/fleet | 200 |  | fleet,cargoBonus,shuttleCargoBonus,resourceSnapshot,resources |  |  |  |
| /api/planets/35572/shipyard | 200 |  | ships,shipSpeedMult,orbitalShipSpeedMult,shipScrapSpeedMult,orbitalShipScrapSpeedMult,planetaryQueue,orbitalQueue,planetaryQueueAll,orbitalQueueAll,planetaryQueueCount,orbitalQueueCount,maxQueueSize |  |  |  |
| /api/players/395/profile |  | 200 |  | profile |  |  |
| /api/players/9696/profile | 200 |  | profile |  |  |  |
| /api/research?planetId=1819 |  | 200 |  | research,researchSpeedMult,activeResearch,activeResearches |  |  |
| /api/research?planetId=35572 | 200 |  | research,researchSpeedMult,activeResearch,activeResearches |  |  |  |

## Notes
- Differences can be caused by progression, permissions, and account state (not only protocol changes).
- Use nf as primary reference for current target universe as requested.
