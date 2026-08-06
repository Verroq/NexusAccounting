# S0 Full API Sweep

Generated: 2026-08-06T06:13:00.250Z

## Context
- base: https://s0.nexuslegacy.space
- userId: 9696
- planetId: 35572
- systemId: 80
- armId: 1
- sectorId: 1
- moonId: 49793
- outpostId: 
- reportId: 

## GET Checks
| Endpoint | Status | OK | Root | Top-level keys | Message |
|---|---:|:---:|---|---|---|
| /api/alliances/my | 200 | True | object | alliance |  |
| /api/alliance-trade/orders?page=1&limit=25 | 200 | True | object | orders,pagination |  |
| /api/auth/me | 200 | True | object | user,planets |  |
| /api/command-center/fleet-templates | 200 | True | array | 0,1,2,3,4 |  |
| /api/fleet/camp-scout-reports?page=1&limit=20 | 200 | True | object | reports |  |
| /api/fleet/expedition-reports?page=1&limit=20 | 200 | True | object | reports,unreadCount |  |
| /api/fleet/mining-reports?page=1&limit=20 | 200 | True | object | reports,unreadCount |  |
| /api/fleet/missions | 200 | True | object | missions,maxFleetSlots |  |
| /api/fleet/pirate-camps | 200 | True | object | camps |  |
| /api/fleet/pirate-reports?page=1&limit=20 | 200 | True | object | reports,unreadCount |  |
| /api/fleet/reports?page=1&limit=20 | 200 | True | object | reports,unreadCount |  |
| /api/fleet/spy-reports?page=1&limit=20 | 200 | True | object | reports,unreadCount |  |
| /api/fleet/survey-cooldowns | 200 | True | object | cooldowns |  |
| /api/fleet/survey-reports | 200 | True | object | reports,unreadCount,restedStatus |  |
| /api/fleet/system-debris | 200 | True | object | debris |  |
| /api/fleet/system-debris?systemId=80 | 200 | True | object | debris |  |
| /api/fleet/wormhole-runs?page=1&limit=20 | 200 | True | object | runs,unreadCount |  |
| /api/fleet/wormholes?page=1&limit=20 | 200 | True | object | wormholes |  |
| /api/galaxy/arms | 200 | True | object | arms |  |
| /api/galaxy/arms/1/sectors | 200 | True | object | sectors |  |
| /api/galaxy/field-index | 200 | True | object | systems |  |
| /api/galaxy/map | 200 | True | object | systems,userSystemIds |  |
| /api/galaxy/sectors/1/systems | 200 | True | object | systems |  |
| /api/galaxy/systems/80/planets | 200 | True | object | planets,asteroidFields,moons,visibility,included,planetCount,hasCivilization |  |
| /api/market/hubs | 200 | True | object | hubs |  |
| /api/market/my-balances | 200 | True | object | balances |  |
| /api/market/my-trades | 200 | True | array | 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39 |  |
| /api/market/orders?page=1&limit=25 | 200 | True | object | orders,pagination |  |
| /api/messages/system?page=1&limit=20 | 200 | True | object | notifications |  |
| /api/moons/49793 | 200 | True | object | moon,buildings,queue,allMoonDefs |  |
| /api/moons/49793/fleet | 403 | False | object | error,code | Not your moon |
| /api/outposts | 200 | True | object | outposts,resourceSnapshots |  |
| /api/planets | 200 | True | object | planets |  |
| /api/planets/35572 | 200 | True | object | planet,serverNow,deadSpaceShieldEnabled,resourceSnapshot,systemInfo,productionBreakdown,productionMultiplier,starterProductionMultiplier,buildSpeedMult,buildQueueCount,buildQueueMax,buildings |  |
| /api/planets/35572/fleet | 200 | True | object | fleet,cargoBonus,shuttleCargoBonus,resourceSnapshot,resources |  |
| /api/planets/35572/shipyard | 200 | True | object | ships,shipSpeedMult,orbitalShipSpeedMult,shipScrapSpeedMult,orbitalShipScrapSpeedMult,planetaryQueue,orbitalQueue,planetaryQueueAll,orbitalQueueAll,planetaryQueueCount,orbitalQueueCount,maxQueueSize |  |
| /api/players/9696/profile | 200 | True | object | profile |  |
| /api/rankings/players?category=military&search=Uuuren | 200 | True | object | leaderboard,pagination |  |
| /api/research | 200 | True | object | research,researchSpeedMult,activeResearch,activeResearches |  |
| /api/research?planetId=35572 | 200 | True | object | research,researchSpeedMult,activeResearch,activeResearches |  |
| /api/stations/sector/1 | 200 | True | object | stations |  |

## POST Probes (invalid payloads, side-effect-safe)
| Endpoint | Status | OK | Top-level keys | Code | Message |
|---|---:|:---:|---|---|---|
| /api/fleet/collect-debris | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/collect-salvage | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/dispatch | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/expedition | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/fuel-estimate | 400 | False | error,code | VALIDATION_ERROR | Invalid request: sourcePlanetId: Number must be greater than 0; targetSystemId: Number must be greater than 0; ships: Select at least one ship or attach the leadership vessel |
| /api/fleet/investigate | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/mine | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/survey | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/fleet/xeno-survey | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/market/orders/-1/fill | 410 | False | error,code | MARKET_DIRECT_FILL_DISABLED | Direct market fills are no longer available. Refresh the game to use the order book. |
| /api/moons/49793/dispatch | 400 | False | error,code | VALIDATION_ERROR | Invalid request body |
| /api/moons/49793/recall | 400 | False | error,details |  | Validation error |
| /api/moons/49793/send | 400 | False | error,details |  | Validation error |
| /api/research/-1/start | 400 | False | error,details |  | Validation error |
