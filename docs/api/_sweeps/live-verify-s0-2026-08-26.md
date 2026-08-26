# S0 Live Doc-Verification Sweep - 2026-08-26

Read-only GET sweep of `https://s0.nexuslegacy.space`. Every `docs/api/{get,post}/*.md` file for a GET
endpoint was regenerated from the live response captured in this sweep: the first `json`
example block now holds a real response with each array truncated to its first item, and each
file ends with a `## Live Verification` section recording the date, the exact path probed, and
the live array sizes at capture time.

No POST/PUT/PATCH/DELETE request was issued.

## Context

- base: `https://s0.nexuslegacy.space`
- auth: `Authorization: Bearer <token>` from the `__Host-nexus-game` session cookie (value never logged or committed)
- userId 428, planetId 29925 (homeworld "Terra", systemId 577), armId 3, sectorId 101 and 47
- moonId 125918, outpostId 654, stationId 20, reportId 27525

## Result

- **60 GET requests, all `200`.** No endpoint returned a non-200 status.
- **20 endpoints had no doc file at all** and now do (see New Docs below).
- **33 existing docs had drifted** from the live shape and were regenerated.
- **7 existing docs already matched** live exactly: `command_center_fleet_templates`, `fleet_camp_scout_reports`, `fleet_wormholes`, `galaxy_arm_sectors`, `galaxy_arms`, `market_my_balances`, `market_my_trades`.
- "Absent live" entries were each checked by hand. All but one are account/sample state, not
  server changes: `auth_me.user.activeLeaderBonuses` only carries the bonuses of the currently
  equipped leader, `galaxy_system_planets.asteroidFields` is empty in system 577,
  `fleet_survey_reports.reports[].uncollectedLoot` is `null` once loot is collected,
  `fleet_missions.missions[].cargo` varies per mission, `fleet_pirate_camps.camps` is empty.
- One real removal: `/api/galaxy/sectors/{id}/systems` items no longer carry `name` or
  `planetCount`; they now carry `armId`, `requiresDeadPlanetOrigin`, `hasColonies`,
  `securityZone`, `starType`, `visibility`. Nothing in `nexus-addon/` reads the dropped fields.

## Drift Detail

| Doc | Endpoint | Change |
|---|---|---|
| [alliance_trade_orders.md](../get/alliance_trade_orders.md) | `/api/alliance-trade/orders?page=1&limit=25` | +8 new: `orders[].armName`, `orders[].offerArtifactId`, `orders[].offerArtifactName`, `orders[].offerArtifactTier`, `orders[].planetPosition`, `orders[].sectorIndex`, `orders[].systemX`, `orders[].systemY` |
| [alliances_my.md](../get/alliances_my.md) | `/api/alliances/my` | +27 new: `alliance.allyPactCooldownUntil`, `alliance.disbandRequestedAt`, `alliance.disbandRequestedBy`, `alliance.disbandScheduledAt`, `alliance.members[].diplomaticEmbassyContributionLevel`, `alliance.members[].economyScore`, `alliance.members[].militaryScore`, `alliance.members[].overallScore` ... |
| [auth_me.md](../get/auth_me.md) | `/api/auth/me` | +10 new: `planets[].securityZone`, `planets[].sortOrder`, `user.activeLeaderBonuses.artifactDropBonus`, `user.activeLeaderBonuses.expeditionLootBonus`, `user.activeLeaderBonuses.fuelCostBonus`, `user.activeLeaderBonuses.popGrowthBonus`, `user.activeLeaderBonuses.shipSpeedBonus`, `user.activeLeaderBonuses.surveyLootBonus` ...; -2 absent live: `user.activeLeaderBonuses.miningYieldBonus`, `user.activeLeaderBonuses.storageBonus` |
| [fleet_expedition_reports.md](../get/fleet_expedition_reports.md) | `/api/fleet/expedition-reports` | +30 new: `reports[].combatLog`, `reports[].createdAt`, `reports[].eventDescription`, `reports[].eventTitle`, `reports[].eventType`, `reports[].explorationDuration`, `reports[].id`, `reports[].isRead` ... |
| [fleet_mining_reports.md](../get/fleet_mining_reports.md) | `/api/fleet/mining-reports` | +31 new: `reports[].cargoStolen`, `reports[].combatLog`, `reports[].cycleCount`, `reports[].drillBreakdowns`, `reports[].fleetComposition`, `reports[].fleetComposition[].attack`, `reports[].fleetComposition[].cargoCapacity`, `reports[].fleetComposition[].damagedQuantity` ... |
| [fleet_missions.md](../get/fleet_missions.md) | `/api/fleet/missions` | +9 new: `missions[].cargo.alloys`, `missions[].hangarAssignments`, `missions[].leadershipVessel`, `missions[].sourceMoonId`, `missions[].sourceOutpostId`, `missions[].sourceStationId`, `missions[].targetFleetMissionId`, `missions[].targetMoonId` ...; -5 absent live: `missions[].cargo._cycleStartedAt`, `missions[].cargo._cyclesDone`, `missions[].cargo._nextCycleAt`, `missions[].cargo._raidDone`, `missions[].cargo.hydrogen` |
| [fleet_pirate_camps.md](../get/fleet_pirate_camps.md) | `/api/fleet/pirate-camps` | -15 absent live: `camps[].currentHpPercent`, `camps[].destroyedAt`, `camps[].fleetComposition`, `camps[].fleetIntel`, `camps[].hasFleetIntel`, `camps[].id`, `camps[].lastScoutedAt`, `camps[].lootTier` ... |
| [fleet_pirate_reports.md](../get/fleet_pirate_reports.md) | `/api/fleet/pirate-reports` | +46 new: `reports[].attackerFleet`, `reports[].attackerFleet[].key`, `reports[].attackerFleet[].leadershipCombat`, `reports[].attackerFleet[].name`, `reports[].attackerFleet[].quantity`, `reports[].attackerFleet[].shipDefId`, `reports[].attackerLosses`, `reports[].campId` ... |
| [fleet_report_detail.md](../get/fleet_report_detail.md) | `/api/fleet/reports/27525` | +82 new: `report.attackerFleet[].key`, `report.attackerFleet[].name`, `report.attackerFleet[].quantity`, `report.attackerFleet[].shipDefId`, `report.attackerId`, `report.attackerLosses[].damaged`, `report.attackerLosses[].destroyed`, `report.attackerLosses[].key` ... |
| [fleet_reports.md](../get/fleet_reports.md) | `/api/fleet/reports` | +38 new: `reports[].attackerId`, `reports[].attackerLosses`, `reports[].attackerLosses[].damaged`, `reports[].attackerLosses[].destroyed`, `reports[].attackerLosses[].key`, `reports[].attackerLosses[].lost`, `reports[].attackerLosses[].name`, `reports[].attackerLosses[].shipDefId` ... |
| [fleet_spy_reports.md](../get/fleet_spy_reports.md) | `/api/fleet/spy-reports` | +39 new: `reports[].buildingData[].key`, `reports[].buildingData[].level`, `reports[].buildingData[].name`, `reports[].defenseData[].key`, `reports[].defenseData[].level`, `reports[].defenseData[].name`, `reports[].expiresAt`, `reports[].fleetData[].key` ... |
| [fleet_survey_cooldowns.md](../get/fleet_survey_cooldowns.md) | `/api/fleet/survey-cooldowns` | +1 new: `dailySurveyCount` |
| [fleet_survey_reports.md](../get/fleet_survey_reports.md) | `/api/fleet/survey-reports` | +23 new: `reports[].combatLog.attackerFleet`, `reports[].combatLog.attackerLosses`, `reports[].combatLog.debris`, `reports[].combatLog.defenderFleet`, `reports[].combatLog.defenderLosses`, `reports[].combatLog.outcome`, `reports[].combatLog.pirateFleet`, `reports[].combatLog.pirateTier` ...; -1 absent live: `reports[].uncollectedLoot.ore` |
| [fleet_wormhole_runs.md](../get/fleet_wormhole_runs.md) | `/api/fleet/wormhole-runs` | +35 new: `runs[].createdAt`, `runs[].currentEncounter`, `runs[].currentFleet`, `runs[].currentFleet[].quantity`, `runs[].currentFleet[].shipDefId`, `runs[].encounterLog`, `runs[].encounterLog[].combat`, `runs[].encounterLog[].combatRounds` ... |
| [galaxy_field_index.md](../get/galaxy_field_index.md) | `/api/galaxy/field-index` | +15 new: `systems[].allianceLocked`, `systems[].fieldCount`, `systems[].fieldType`, `systems[].maxRichness`, `systems[].minRichness`, `systems[].questKey`, `systems[].requiresDeadPlanetOrigin`, `systems[].richestFieldId` ... |
| [galaxy_map.md](../get/galaxy_map.md) | `/api/galaxy/map` | +5 new: `systems[].hasColonies`, `systems[].name`, `systems[].requiresDeadPlanetOrigin`, `systems[].starType`, `userSystemIds` |
| [galaxy_sector_systems.md](../get/galaxy_sector_systems.md) | `/api/galaxy/sectors/101/systems` | +2 new: `systems[].armId`, `systems[].requiresDeadPlanetOrigin`; -2 absent live: `systems[].name`, `systems[].planetCount` |
| [galaxy_system_planets.md](../get/galaxy_system_planets.md) | `/api/galaxy/systems/577/planets` | +18 new: `hasCivilization`, `included`, `included.fields`, `included.moons`, `included.planets`, `moons[].colonizedAt`, `moons[].ownerAvatarUrl`, `moons[].ownerIsVacationMode` ...; -10 absent live: `asteroidFields[].fieldType`, `asteroidFields[].id`, `asteroidFields[].name`, `asteroidFields[].position`, `asteroidFields[].remainingResources`, `asteroidFields[].richness`, `asteroidFields[].systemId`, `asteroidFields[].totalResources` ... |
| [market_hubs.md](../get/market_hubs.md) | `/api/market/hubs` | +11 new: `hubs[].armId`, `hubs[].armName`, `hubs[].commissionRate`, `hubs[].isActive`, `hubs[].sectorIndex`, `hubs[].securityZone`, `hubs[].starType`, `hubs[].systemId` ... |
| [market_orders.md](../get/market_orders.md) | `/api/market/orders?page=1&limit=25` | +9 new: `orders[].baseAmount`, `orders[].baseRemaining`, `orders[].baseResource`, `orders[].limitPrice`, `orders[].quoteAmount`, `orders[].quoteResource`, `pagination.limit`, `pagination.offset` ... |
| [messages_system.md](../get/messages_system.md) | `/api/messages/system` | +1 new: `notifications[].senderAvatar` |
| [moon_detail.md](../get/moon_detail.md) | `/api/moons/125918` | +155 new: `allMoonDefs[].allowedOn`, `allMoonDefs[].alloysFromLevel`, `allMoonDefs[].baseBuildTime`, `allMoonDefs[].baseCostAlloys`, `allMoonDefs[].baseCostHydrogen`, `allMoonDefs[].baseCostOre`, `allMoonDefs[].baseCostSilicates`, `allMoonDefs[].buildTimeFactor` ... |
| [moon_fleet.md](../get/moon_fleet.md) | `/api/moons/125918/fleet` | +40 new: `fleet[].damagedQuantity`, `fleet[].definition`, `fleet[].definition.allowedCargo`, `fleet[].definition.armorType`, `fleet[].definition.attack`, `fleet[].definition.buildTime`, `fleet[].definition.cargoCapacity`, `fleet[].definition.costAlloys` ... |
| [outposts.md](../get/outposts.md) | `/api/outposts` | +115 new: `outposts[].alloys`, `outposts[].asteroidField`, `outposts[].asteroidField.allianceId`, `outposts[].asteroidField.controllerUserId`, `outposts[].asteroidField.createdAt`, `outposts[].asteroidField.expiresAt`, `outposts[].asteroidField.fieldType`, `outposts[].asteroidField.id` ... |
| [planet_fleet.md](../get/planet_fleet.md) | `/api/planets/29925/fleet` | +78 new: `fleet[].definition.armorType`, `fleet[].definition.attack`, `fleet[].definition.buildTime`, `fleet[].definition.costAlloys`, `fleet[].definition.costHydrogen`, `fleet[].definition.costOre`, `fleet[].definition.costSilicates`, `fleet[].definition.effectiveAttack` ... |
| [planets_detail.md](../get/planets_detail.md) | `/api/planets/29925` | +58 new: `buildQueueCount`, `buildQueueMax`, `buildSpeedMult`, `buildings[].demolishPreview`, `buildings[].pvpEconomicLevelLossEligibleAt`, `buildings[].pvpEconomicRepairProtectsLevel`, `deadSpaceShieldEnabled`, `planet.deadSpaceShieldSuppressedUntil` ... |
| [planets_list.md](../get/planets_list.md) | `/api/planets` | +1 new: `planets[].sortOrder` |
| [planets_shipyard.md](../get/planets_shipyard.md) | `/api/planets/29925/shipyard` | +17 new: `maxQueueSize`, `orbitalQueue`, `orbitalQueueAll`, `orbitalQueueCount`, `orbitalShipScrapSpeedMult`, `orbitalShipSpeedMult`, `planetaryQueue`, `planetaryQueueAll` ... |
| [players_profile.md](../get/players_profile.md) | `/api/players/428/profile` | +19 new: `profile.alliance`, `profile.alliance.iconKey`, `profile.alliance.id`, `profile.alliance.name`, `profile.alliance.role`, `profile.alliance.tag`, `profile.isSelf`, `profile.rewardCosmetics` ... |
| [rankings_players.md](../get/rankings_players.md) | `/api/rankings/players` | +5 new: `leaderboard[].allianceIconKey`, `leaderboard[].allianceId`, `leaderboard[].avatarUrl`, `leaderboard[].portraitFrame`, `leaderboard[].title` |
| [research.md](../get/research.md) | `/api/research?planetId=29925` | +24 new: `activeResearch`, `activeResearch.endsAt`, `activeResearch.id`, `activeResearch.key`, `activeResearch.name`, `activeResearch.pauseReason`, `activeResearch.planetId`, `activeResearch.planetName` ... |
| [stations_sector.md](../get/stations_sector.md) | `/api/stations/sector/47` | +18 new: `stations[].buildings[].buildingKey`, `stations[].buildings[].id`, `stations[].buildings[].isUpgrading`, `stations[].buildings[].level`, `stations[].buildings[].stationId`, `stations[].buildings[].upgradeEndsAt`, `stations[].buildings[].upgradeJobId`, `stations[].captureProtectedUntil` ... |
| [system_debris.md](../get/system_debris.md) | `/api/fleet/system-debris` | +5 new: `debris[].createdAt`, `debris[].locationId`, `debris[].locationType`, `debris[].requiresDeadPlanetOrigin`, `debris[].securityZone` |

## New Docs

| Doc | Endpoint |
|---|---|
| [alliance_trade_hub_status.md](../get/alliance_trade_hub_status.md) | `/api/alliance-trade/hub-status` |
| [directives.md](../get/directives.md) | `/api/directives` |
| [fleet_colonization_reports.md](../get/fleet_colonization_reports.md) | `/api/fleet/colonization-reports` |
| [fleet_cyber_reports.md](../get/fleet_cyber_reports.md) | `/api/fleet/cyber-reports` |
| [fleet_field_scan_reports.md](../get/fleet_field_scan_reports.md) | `/api/fleet/field-scan-reports` |
| [fleet_incoming.md](../get/fleet_incoming.md) | `/api/fleet/incoming` |
| [fleet_mine_reports.md](../get/fleet_mine_reports.md) | `/api/fleet/mine-reports` |
| [fleet_patrol_reports.md](../get/fleet_patrol_reports.md) | `/api/fleet/patrol-reports` |
| [fleet_stationed_garrisons.md](../get/fleet_stationed_garrisons.md) | `/api/fleet/stationed-garrisons` |
| [galaxy_colony_status.md](../get/galaxy_colony_status.md) | `/api/galaxy/colony-status` |
| [game_config.md](../get/game_config.md) | `/api/game-config` |
| [logistics_collectible_sources.md](../get/logistics_collectible_sources.md) | `/api/logistics/collectible-sources` |
| [logistics_hub_levels.md](../get/logistics_hub_levels.md) | `/api/logistics/hub-levels` |
| [logistics_routes.md](../get/logistics_routes.md) | `/api/logistics/routes` |
| [market_artifacts.md](../get/market_artifacts.md) | `/api/market/artifacts` |
| [market_my_orders.md](../get/market_my_orders.md) | `/api/market/my-orders` |
| [moons_colony_status.md](../get/moons_colony_status.md) | `/api/moons/colony-status` |
| [outpost_detail.md](../get/outpost_detail.md) | `/api/outposts/{outpostId}` (probed with `654`) |
| [planets_activity_summary.md](../get/planets_activity_summary.md) | `/api/planets/activity-summary` |
| [stations_detail.md](../get/stations_detail.md) | `/api/stations/{stationId}` (probed with `20`) |

## Endpoints Documented but Not Referenced in `nexus-addon/`

Live and documented, but no addon code calls them. Not a bug - flagged so the docs are known
to be ahead of the code rather than describing dead endpoints.

- `/api/alliance-trade/hub-status` ([alliance_trade_hub_status.md](../get/alliance_trade_hub_status.md))
- `/api/command-center/fleet-templates` ([command_center_fleet_templates.md](../get/command_center_fleet_templates.md))
- `/api/directives` ([directives.md](../get/directives.md))
- `/api/fleet/colonization-reports` ([fleet_colonization_reports.md](../get/fleet_colonization_reports.md))
- `/api/fleet/cyber-reports` ([fleet_cyber_reports.md](../get/fleet_cyber_reports.md))
- `/api/fleet/field-scan-reports` ([fleet_field_scan_reports.md](../get/fleet_field_scan_reports.md))
- `/api/fleet/incoming` ([fleet_incoming.md](../get/fleet_incoming.md))
- `/api/fleet/patrol-reports` ([fleet_patrol_reports.md](../get/fleet_patrol_reports.md))
- `/api/fleet/stationed-garrisons` ([fleet_stationed_garrisons.md](../get/fleet_stationed_garrisons.md))
- `/api/galaxy/colony-status` ([galaxy_colony_status.md](../get/galaxy_colony_status.md))
- `/api/galaxy/field-index` ([galaxy_field_index.md](../get/galaxy_field_index.md))
- `/api/game-config` ([game_config.md](../get/game_config.md))
- `/api/logistics/collectible-sources` ([logistics_collectible_sources.md](../get/logistics_collectible_sources.md))
- `/api/logistics/hub-levels` ([logistics_hub_levels.md](../get/logistics_hub_levels.md))
- `/api/logistics/routes` ([logistics_routes.md](../get/logistics_routes.md))
- `/api/market/artifacts` ([market_artifacts.md](../get/market_artifacts.md))
- `/api/market/my-balances` ([market_my_balances.md](../get/market_my_balances.md))
- `/api/market/my-orders` ([market_my_orders.md](../get/market_my_orders.md))
- `/api/market/my-trades` ([market_my_trades.md](../get/market_my_trades.md))
- `/api/players/{userId}/profile` ([players_profile.md](../get/players_profile.md))
- `/api/stations/{stationId}` ([stations_detail.md](../get/stations_detail.md))
- `/api/stations/sector/{sectorId}` ([stations_sector.md](../get/stations_sector.md))

## Not Probed

- All mutating docs (`fleet_dispatch`, `fleet_mine`, `fleet_survey`, `fleet_collect_salvage`,
  `fleet_investigate`, `fleet_collect_debris`, `fleet_expedition`, `fleet_xeno_survey`,
  `fleet_fuel_estimate`, `research_start`, `outpost_collect`, `outpost_garrison`,
  `outpost_supply`, `moon_dispatch`, `moon_recall`, `moon_send`, `market_order_fill`) - the
  sweep is read-only. Their examples are unchanged. The outpost write docs no longer claim
  "no outpost ID was available": ids exist now (e.g. `654`), so a targeted write probe is
  possible when wanted.
- `images.md` - static asset paths, not JSON responses.

## Method

- IDs discovered from `/api/auth/me`, `/api/planets`, `/api/outposts`,
  `/api/logistics/collectible-sources` and `/api/fleet/reports`, then reused.
- ~200ms between requests; no 429 at any point.
- Drift computed by diffing live JSON key paths (up to 3 levels, first 3 items of each array)
  against the key paths in the pre-sweep doc example, using `git show HEAD:<doc>`.
- Doc examples truncate arrays to one item, so a doc example is a shape reference, not a
  volume reference; the `Live Verification` section carries the real array sizes.
