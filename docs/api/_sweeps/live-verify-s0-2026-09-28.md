# S0 API Sanity Check - 2026-09-28

Two passes against `https://s0.nexuslegacy.space`: a live GET sweep of every documented endpoint,
and a fresh client-bundle crawl diffed against the
[2026-08-26 discovery](./client-bundle-discovery-2026-08-26.md). The per-endpoint docs were **not**
regenerated; this report records what changed so the docs and the addon can follow.

No mutating request was issued. The only POST sent was `/api/fleet/fuel-estimate`, which is read-only.

## Context

- auth: `Authorization: Bearer <token>`, the `kind: game` JWT (value never logged or committed)
- probe paths: the exact path in each doc's `## Live Verification` section (userId 428, planetId 29925,
  moonId 125918, outpostId 654, stationId 20, reportId 27525)
- field diff: live response keys (arrays walked through their first item) vs the doc's first `json` example

## Result

- **70 of 70 probed GETs answered `200`.** (`ark_detail.md` and `images.md` carry no probe path.)
- **Client bundle: 480 endpoints** (434 on 2026-08-26). **46 are new**, listed below.
  None of the endpoints the addon calls disappeared.
- **One breaking schema change: spy reports (espionage v2).** Fixed in the addon, see below.
- **`hangarAssignments`** is now sent by the game client on more fleet sends than mine.

## Breaking: spy reports moved to `intel` (espionage v2)

Reports from 2026-09-25 onward return `buildingData`, `defenseData`, `fleetData` and `resourceData`
as `null`; the scan is in a new `intel` object. Older reports keep the old fields and have no `intel`.

```json
"intel": {
  "version": 2, "tier": 4, "mode": "quick", "lost": false, "detected": false,
  "capturedAt": "2026-09-26T20:34:47.877Z",
  "target": { "kind": "planet", "name": "GAS", "systemId": 4652 },
  "fleet": {
    "ships": [{ "key": "battleship", "name": "Battleship", "shipDefId": 10, "quantity": 0, "damagedQuantity": 22 }],
    "sizes": [], "total": { "min": 0, "max": 0 }
  },
  "buildings": [{ "key": "solar_plant", "name": "Solar Plant", "level": 22 }],
  "defenses": [{ "key": "shield_generator", "name": "Shield Generator", "level": 7 }],
  "resources": { "ore": 0, "hydrogen": 24, "cryoIce": 0, "antimatter": 164 },
  "combatResearch": { "ownerId": 0, "levels": [{ "key": "...", "level": 0 }] }
}
```

How the game client reads it (from its renderer):

- `fleet.ships[].quantity` is the **active** count; damaged ships are in `damagedQuantity`, not included.
- Below tier 4 a number is replaced by a `{min, max}` range: `quantityRange`, `damagedRange`,
  `levelRange`, and range objects as resource values. `max` may be `null` ("min+").
- `null` for `fleet.ships`, `buildings`, `defenses` or `resources` means "not revealed at this tier";
  `[]` means "revealed, none".
- Resource keys are camelCase (`cryoIce`, `quantumDust`), unlike the snake_case used elsewhere.
- `resourceData.tier` (`"exact"`) has no counterpart; precision is `intel.tier` (1-4).

Addon fix: `processSpyReports` falls back to `intel` when the old fields are null. Ships and levels
take the top of a range, resources the bottom, resource keys are stored snake_case.

## Request bodies vs the game client

Each addon POST compared with the body the official client builds for the same endpoint.

| Endpoint | Status | Client sends in addition |
|---|---|---|
| `/fleet/mine` | OK | `escortRetreatThreshold` (optional) |
| `/fleet/investigate` | **`hangarAssignments` added** | - |
| `/fleet/xeno-survey` | **`hangarAssignments` added** | - |
| `/fleet/expedition` | OK | `hangarAssignments`, `targetSectorId` only when set |
| `/stations/{id}/send` | OK | `hangarAssignments` only when set; `forcePactBreak`/`forceShieldBreak` on attacks |
| `/fleet/survey` | OK | `attachLeader` |
| `/fleet/collect-debris` | OK | `attachLeader`; `target` as an alternative to `debrisId` |
| `/fleet/collect-salvage` | OK | `attachLeader` |
| `/fleet/fuel-estimate` | OK | `missionType` - live-tested: `200` with or without it |
| `/research/{id}/start` | OK | - |
| `/combat-simulator/simulate` | OK | - |

## Field changes per endpoint

Missing keys are mostly data-dependent: an array that is empty today (pirate camps, survey cooldowns,
moon fleet) or a loot type that varies per report. Only spy reports is a confirmed shape change.
Round-level shield fields (`attackerShieldHp` etc.) could not be confirmed either way: the only
reports with rounds date from 2026-06-21.

| Doc | Probed path | Diff |
|---|---|---|
| [alliances_my.md](../get/alliances_my.md) | `/api/alliances/my` | +6: `alliance.council`, `alliance.councilActivatedAt`, `alliance.councilSetupDeadlineAt`, `alliance.councilVacancyDeadlineAt`, `alliance.isRiftSealer`, `alliance.leaderVacatedAt` |
| [artifacts.md](../get/artifacts.md) | `/api/artifacts` | +1: `[].isTranscended` |
| [auth_me.md](../get/auth_me.md) | `/api/auth/me` | +2: `user.activeLeaderBonuses.asteroidFieldRareYieldBonus`, `user.activeLeaderBonuses.rareProductionBonus` |
| [combat_simulator_bootstrap.md](../get/combat_simulator_bootstrap.md) | `/api/combat-simulator/bootstrap` | +4: `planetaryDefense`, `planetaryDefense[].key`, `planetaryDefense[].maxLevel`, `planetaryDefense[].name` |
| [fleet_expedition_reports.md](../get/fleet_expedition_reports.md) | `/api/fleet/expedition-reports` | +9: `reports[].leadershipRewards`, `reports[].leadershipRewards[].createdAt`, `reports[].leadershipRewards[].key`, `reports[].leadershipRewards[].kind`, `reports[].leadershipRewards[].label`, `reports[].leadershipRewards[].rarity`, `reports[].leadershipRewards[].source`, `reports[].leadershipRewards[].sourceRef` … (+1); -4 absent: `reports[].loot.artifact`, `reports[].loot.plasma_core`, `reports[].loot.quantum_dust`, `reports[].loot.silicates` |
| [fleet_field_scan_reports.md](../get/fleet_field_scan_reports.md) | `/api/fleet/field-scan-reports` | +1: `reports[].intel` |
| [fleet_mining_reports.md](../get/fleet_mining_reports.md) | `/api/fleet/mining-reports` | +5: `reports[].resourcesDelivered._cycleStartedAt`, `reports[].resourcesDelivered._mineUntilFull`, `reports[].resourcesDelivered._nextCycleAt`, `reports[].resourcesDelivered._raidDone`, `reports[].resourcesDelivered.quantum_dust`; -3 absent: `reports[].resourcesDelivered._drillBreakdowns`, `reports[].resourcesDelivered.ore`, `reports[].resourcesDelivered.silicates` |
| [fleet_missions.md](../get/fleet_missions.md) | `/api/fleet/missions` | +6: `missions[].cargo._cargoCapacity`, `missions[].combinedAssaultId`, `missions[].convoyArrivesAt`, `missions[].logisticsRouteId`, `missions[].sourceGuildId`, `missions[].targetGuildId`; -1 absent: `missions[].cargo.alloys` |
| [fleet_pirate_camps.md](../get/fleet_pirate_camps.md) | `/api/fleet/pirate-camps` | -15 absent: `camps[].currentHpPercent`, `camps[].destroyedAt`, `camps[].fleetComposition`, `camps[].fleetIntel`, `camps[].hasFleetIntel`, `camps[].id`, `camps[].lastScoutedAt`, `camps[].lootTier` … (+7) |
| [fleet_pirate_reports.md](../get/fleet_pirate_reports.md) | `/api/fleet/pirate-reports` | -6 absent: `reports[].rounds[].attackerShieldHp`, `reports[].rounds[].attackerShieldMaxHp`, `reports[].rounds[].defenderShieldHp`, `reports[].rounds[].defenderShieldMaxHp`, `reports[].rounds[].events[].damageByPlayer`, `reports[].rounds[].events[].damageByPlayer.428` |
| [fleet_report_detail.md](../get/fleet_report_detail.md) | `/api/fleet/reports/27525` | +1: `report.defenderIntelHidden` |
| [fleet_reports.md](../get/fleet_reports.md) | `/api/fleet/reports` | +3: `reports[].defenderIntelHidden`, `reports[].lootStolen.antimatter`, `reports[].roundCount` |
| [fleet_spy_reports.md](../get/fleet_spy_reports.md) | `/api/fleet/spy-reports` | +47: `reports[].intel`, `reports[].intel.buildings`, `reports[].intel.buildings[].key`, `reports[].intel.buildings[].level`, `reports[].intel.buildings[].name`, `reports[].intel.capturedAt`, `reports[].intel.combatResearch`, `reports[].intel.combatResearch.levels` … (+39); -15 absent: `reports[].buildingData[].key`, `reports[].buildingData[].level`, `reports[].buildingData[].name`, `reports[].defenseData[].key`, `reports[].defenseData[].level`, `reports[].defenseData[].name`, `reports[].fleetData[].key`, `reports[].fleetData[].name` … (+7) |
| [fleet_survey_cooldowns.md](../get/fleet_survey_cooldowns.md) | `/api/fleet/survey-cooldowns` | -3 absent: `cooldowns[].cooldownEndsAt`, `cooldowns[].lastSurveyAt`, `cooldowns[].systemId` |
| [fleet_survey_reports.md](../get/fleet_survey_reports.md) | `/api/fleet/survey-reports` | -12 absent: `reports[].combatLog.playerTech.leaderAttackBonus`, `reports[].combatLog.playerTech.leaderHpBonus`, `reports[].combatLog.playerTech.leaderShieldRegenBonus`, `reports[].combatLog.restedAnomalyBonus`, `reports[].combatLog.restedAnomalyBonus.applied`, `reports[].combatLog.restedAnomalyBonus.chargesRemaining`, `reports[].combatLog.restedAnomalyBonus.multiplier`, `reports[].combatLog.rounds[].attackerShieldHp` … (+4) |
| [galaxy_map.md](../get/galaxy_map.md) | `/api/galaxy/map` | +11: `postRift`, `postRift.constructionEndsAt`, `postRift.constructionStartedAt`, `postRift.phase`, `postRift.revision`, `postRift.riftSystemId`, `postRift.sealedAt`, `postRift.stationImage` … (+3) |
| [galaxy_system_planets.md](../get/galaxy_system_planets.md) | `/api/galaxy/systems/577/planets` | +3: `moons[].ownerIsInactive`, `planets[].ownerIsInactive`, `planets[].relocationEligible` |
| [leader.md](../get/leader.md) | `/api/leader` | +2: `activeBonuses.asteroidFieldRareYieldBonus`, `activeBonuses.rareProductionBonus` |
| [leadership.md](../get/leadership.md) | `/api/leadership` | +13: `modules[].metadata.crew`, `modules[].metadata.grade`, `modules[].metadata.origin`, `modules[].metadata.role`, `vessel.currentGuildId`, `vessel.guildReturnDestination`, `vessel.guildReturnDestination.id`, `vessel.guildReturnDestination.type` … (+5); -8 absent: `modules[].metadata.owned`, `modules[].metadata.reward`, `modules[].metadata.source`, `modules[].metadata.sourceRef`, `modules[].metadata.swapDurationSeconds`, `xpEvents[].metadata.dangerous`, `xpEvents[].metadata.securityZone`, `xpEvents[].metadata.systemId` |
| [logistics_hub_levels.md](../get/logistics_hub_levels.md) | `/api/logistics/hub-levels` | +1: `hubLevels[].activeFleetCount` |
| [logistics_routes.md](../get/logistics_routes.md) | `/api/logistics/routes` | +25: `routes[].amount`, `routes[].createdAt`, `routes[].destinationMoonId`, `routes[].destinationMoonName`, `routes[].destinationOutpostId`, `routes[].destinationOutpostName`, `routes[].destinationPlanetId`, `routes[].destinationPlanetName` … (+17) |
| [moon_fleet.md](../get/moon_fleet.md) | `/api/moons/125918/fleet` | -43 absent: `fleet[].damagedQuantity`, `fleet[].definition`, `fleet[].definition.allowedCargo`, `fleet[].definition.armorType`, `fleet[].definition.attack`, `fleet[].definition.buildTime`, `fleet[].definition.cargoCapacity`, `fleet[].definition.costAlloys` … (+35) |
| [planet_fleet.md](../get/planet_fleet.md) | `/api/planets/29925/fleet` | +6: `fleet[].definition.baseMiningRates`, `fleet[].definition.displaySpeed`, `fleet[].definition.effectiveDamageReduction`, `fleet[].definition.effectiveFuelRate`, `fleet[].definition.effectiveMiningRates`, `miningCargoBonus` |
| [planets_activity_summary.md](../get/planets_activity_summary.md) | `/api/planets/activity-summary` | +11: `planets[].buildingQueue.endsAt`, `planets[].buildingQueue.key`, `planets[].buildingQueue.name`, `planets[].buildingQueues[].endsAt`, `planets[].buildingQueues[].id`, `planets[].buildingQueues[].key`, `planets[].buildingQueues[].name`, `planets[].buildingQueues[].operation` … (+3) |
| [planets_detail.md](../get/planets_detail.md) | `/api/planets/29925` | +3: `buildings[].defenseRepair`, `buildings[].pvpUpgradePaused`, `buildings[].repairQueueStatus` |
| [planets_shipyard.md](../get/planets_shipyard.md) | `/api/planets/29925/shipyard` | +5: `ships[].baseMiningRates`, `ships[].displaySpeed`, `ships[].effectiveDamageReduction`, `ships[].effectiveFuelRate`, `ships[].effectiveMiningRates` |
| [players_profile.md](../get/players_profile.md) | `/api/players/428/profile` | +1: `profile.isInactive`; -2 absent: `profile.rewardCosmetics[].dropCollection`, `profile.rewardCosmetics[].shipDefKey` |
| [rankings_players.md](../get/rankings_players.md) | `/api/rankings/players` | +1: `leaderboard[].allianceRiftSealer` |
| [research.md](../get/research.md) | `/api/research?planetId=29925` | +1: `research[].effects[].resource` |
| [stations_detail.md](../get/stations_detail.md) | `/api/stations/20` | +8: `station.captureAttempt`, `station.captureAttempt.nextAvailableAt`, `station.captureAttempt.status`, `station.captureAttempt.used`, `station.captureAttempt.usedAt`, `station.defenseCommandLimit`, `station.defenseSupportSource`, `station.defenseSupportTier` |

`/api/game-config` returned 61 keys beyond its doc example (the doc only shows a subset).

## New endpoints since 2026-08-26

Not probed. Normalisation noise from the 08-26 list (`/auth/{id}fa/*` is `/auth/2fa/*`) is excluded.

### `/admin`

| Endpoint | Verbs |
|---|---|
| `/admin/email/campaigns/beta-experiments` | GET |
| `/admin/email/campaigns/beta-experiments/send` | POST |
| `/admin/payment-reversals` | GET |
| `/admin/universes/{id}/menu-notice` | PUT |

### `/alliances`

| Endpoint | Verbs |
|---|---|
| `/alliances/diplomacy/war` | POST |
| `/alliances/my/council/appoint` | POST |
| `/alliances/my/council/resign` | POST |
| `/alliances/my/council/votes` | POST |
| `/alliances/my/council/votes/{id}` | DELETE |
| `/alliances/my/council/votes/{id}/ballot` | PUT |
| `/alliances/territory-management` | GET |
| `/alliances/territory-management/capital` | POST |
| `/alliances/territory-management/priorities` | PUT |

### `/artifacts`

| Endpoint | Verbs |
|---|---|
| `/artifacts/inventory-marks` | GET/POST |
| `/artifacts/shards` | GET |
| `/artifacts/shards/dismantle` | POST |
| `/artifacts/shards/inventory` | GET |
| `/artifacts/trader` | GET |
| `/artifacts/trader/buy` | POST |
| `/artifacts/trader/summon` | POST |

### `/combat-engagements`

| Endpoint | Verbs |
|---|---|
| `/combat-engagements` | GET |
| `/combat-engagements/{id}` | GET |
| `/combat-engagements/{id}/hold-position` | POST |
| `/combat-engagements/{id}/participants/{id}/retreat` | POST |

### `/fleet`

| Endpoint | Verbs |
|---|---|
| `/fleet/supply` | GET |
| `/fleet/supply-planet` | PUT |

### `/galaxy`

| Endpoint | Verbs |
|---|---|
| `/galaxy/planet-index` | GET |
| `/galaxy/post-rift` | GET |

### `/leadership`

| Endpoint | Verbs |
|---|---|
| `/leadership/crew-contracts` | GET |
| `/leadership/crew-contracts/archive` | GET |
| `/leadership/crew-contracts/transfer` | POST |
| `/leadership/guild` | GET |
| `/leadership/guild/exchange` | POST |
| `/leadership/guild/visit` | GET |
| `/leadership/guild/visit/move` | POST |

### `/messages`

| Endpoint | Verbs |
|---|---|
| `/messages/system/preferences` | GET/PATCH |

### `/outposts`

| Endpoint | Verbs |
|---|---|
| `/outposts/{id}/dismantle` | POST |
| `/outposts/{id}/dismantle/estimate` | POST |
| `/outposts/{id}/dismantle/targets` | GET |
| `/outposts/{id}/self-destruct` | POST |
| `/outposts/{id}/self-destruct/estimate` | POST |

### `/planets`

| Endpoint | Verbs |
|---|---|
| `/planets/{id}/relocation` | POST |
| `/planets/{id}/relocation/preview` | POST |

### `/rift-seal`

| Endpoint | Verbs |
|---|---|
| `/rift-seal/public-status` | GET |
| `/rift-seal/spy` | POST |

### `/store`

| Endpoint | Verbs |
|---|---|
| `/store/gift/recipient` | POST |
