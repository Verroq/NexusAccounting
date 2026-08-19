# Complete API Catalog (NF universe)

Generated from live MCP sweep on 2026-08-06 against https://nf.nexuslegacy.space.

## Live-checked endpoints

| Endpoint | Status | OK | Top-level keys | Notes |
|---|---:|:---:|---|---|
| /api/alliances/my | 200 | True | alliance |  |
| /api/alliance-trade/orders?page=1&limit=25 | 200 | True | orders,pagination |  |
| /api/auth/me | 200 | True | user,planets |  |
| /api/command-center/fleet-templates | 200 | True |  | Empty object/array response in current account context |
| /api/fleet/camp-scout-reports?page=1&limit=20 | 200 | True | reports |  |
| /api/fleet/expedition-reports?page=1&limit=20 | 200 | True | reports,unreadCount |  |
| /api/fleet/mining-reports?page=1&limit=20 | 200 | True | reports,unreadCount |  |
| /api/fleet/missions | 200 | True | missions,maxFleetSlots |  |
| /api/fleet/pirate-camps | 200 | True | camps |  |
| /api/fleet/pirate-reports?page=1&limit=20 | 200 | True | reports,unreadCount |  |
| /api/fleet/reports?page=1&limit=20 | 200 | True | reports,unreadCount |  |
| /api/fleet/spy-reports?page=1&limit=20 | 200 | True | reports,unreadCount |  |
| /api/fleet/survey-cooldowns | 200 | True | cooldowns |  |
| /api/fleet/survey-reports | 200 | True | reports,unreadCount,restedStatus |  |
| /api/fleet/system-debris | 200 | True | debris |  |
| /api/fleet/system-debris?systemId={systemId} | 200 | True | debris |  |
| /api/fleet/wormhole-runs?page=1&limit=20 | 200 | True | runs,unreadCount |  |
| /api/fleet/wormholes?page=1&limit=20 | 200 | True | wormholes |  |
| /api/galaxy/arms | 200 | True | arms |  |
| /api/galaxy/arms/{armId}/sectors | 200 | True | sectors |  |
| /api/galaxy/field-index | 200 | True | systems |  |
| /api/galaxy/map | 200 | True | systems,userSystemIds |  |
| /api/galaxy/sectors/{sectorId}/systems | 200 | True | systems |  |
| /api/galaxy/systems/{systemId}/planets | 200 | True | planets,asteroidFields,moons,visibility,included,planetCount,hasCivilization |  |
| /api/market/hubs | 200 | True | hubs |  |
| /api/market/my-balances | 403 | False | error,code | Research Market Access to unlock trading |
| /api/market/my-trades | 403 | False | error,code | Research Market Access to unlock trading |
| /api/market/orders?page=1&limit=25 | 403 | False | error,code | Research Market Access to unlock trading |
| /api/messages/system?page=1&limit=20 | 200 | True | notifications |  |
| /api/moons/{id} | 200 | True | moon,buildings,queue,allMoonDefs |  |
| /api/moons/{id}/fleet | 403 | False | error,code | Not your moon |
| /api/outposts | 200 | True | outposts,resourceSnapshots |  |
| /api/planets | 200 | True | planets |  |
| /api/planets/{planetId} | 200 | True | planet,serverNow,deadSpaceShieldEnabled,resourceSnapshot,systemInfo,productionBreakdown,productionMultiplier,starterProductionMultiplier,buildSpeedMult,buildQueueCount,buildQueueMax,buildings |  |
| /api/planets/{planetId}/fleet | 200 | True | fleet,cargoBonus,shuttleCargoBonus,resourceSnapshot,resources |  |
| /api/planets/{planetId}/shipyard | 200 | True | ships,shipSpeedMult,orbitalShipSpeedMult,shipScrapSpeedMult,orbitalShipScrapSpeedMult,planetaryQueue,orbitalQueue,planetaryQueueAll,orbitalQueueAll,planetaryQueueCount,orbitalQueueCount,maxQueueSize |  |
| /api/players/{userId}/profile | 200 | True | profile |  |
| /api/rankings/players?category=military&search=Uuuren | 200 | True | leaderboard,pagination |  |
| /api/research | 200 | True | research,researchSpeedMult,activeResearch,activeResearches |  |
| /api/research?planetId={planetId} | 200 | True | research,researchSpeedMult,activeResearch,activeResearches |  |
| /api/stations/sector/{sectorId} | 200 | True | stations |  |

## Endpoints used in code but not yet documented

- /api/alliance-trade/orders
- /api/fleet/camp-scout-reports
- /api/fleet/dispatch
- /api/fleet/expedition
- /api/fleet/expedition-reports
- /api/fleet/mine
- /api/fleet/mining-reports
- /api/fleet/pirate-reports
- /api/fleet/reports
- /api/fleet/reports/{id}
- /api/fleet/spy-reports
- /api/fleet/wormhole-runs
- /api/fleet/wormholes
- /api/fleet/xeno-survey
- /api/galaxy/sectors/{id}/systems
- /api/messages/system
- /api/moons/{id}
- /api/moons/{id}/dispatch
- /api/moons/{id}/fleet
- /api/moons/{id}/recall
- /api/moons/{id}/send
- /api/outposts
- /api/outposts/{id}/collect
- /api/outposts/{id}/garrison
- /api/outposts/{id}/supply
- /api/planets
- /api/rankings/players
- /api/research/{id}/start

## Validation limits

- Mutation endpoints (POST/dispatch/supply/collect/start/fill) were not executed to avoid side effects.
- Some GET endpoints are permission-gated (for example market access research) and can return 403 until unlocked.
