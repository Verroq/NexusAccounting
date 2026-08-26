# Nexus Legacy API Notes

This folder documents the Nexus Legacy game API capabilities that are currently used or observed by this addon.

## Scope

- Coverage is based on endpoints referenced in the source tree.
- Existing files document endpoints that were already analyzed earlier.
- New files added here document the remaining observed capabilities.
- Some payloads are fully confirmed from TypeScript models.
- Some payloads are partial and marked as inferred when the addon only consumes a subset of fields.

## Layout

- `get/` — read-only endpoints. Each file's example is a real captured response.
- `post/` — mutating endpoints (POST, plus the one DELETE: `post/ark_labs_detach.md`). Their
  examples are request bodies; response shapes are marked inferred where they were not probed.
- `_sweeps/` — dated audit reports, not per-endpoint docs.

The index below stays grouped by game area, so the folder in each link tells you the method.

## Confirmed Core Behavior

- Requests are sent with browser session cookies via `credentials: include`.
- The extension rewrites `Origin` and `Referer` for `/api/*` requests so dashboard-originated calls behave like in-game requests.
- Rate-limit headers `ratelimit-limit`, `ratelimit-remaining`, and `ratelimit-reset` are observed and used by the client.

## Live Audit (Primary: S0)

- Primary validation target: `https://s0.nexuslegacy.space`
- Latest sweep (GET-only, docs regenerated from live responses): [live-verify-s0-2026-08-26.md](./_sweeps/live-verify-s0-2026-08-26.md)
- Full API surface pulled from the game client bundle (434 endpoints, 328 still undocumented): [client-bundle-discovery-2026-08-26.md](./_sweeps/client-bundle-discovery-2026-08-26.md)
- Every GET doc below ends with a `## Live Verification` section stating when its example was captured.
- Previous sweep summary (GET + safe POST probes): [live-sweep-s0-full-2026-08-06.md](./_sweeps/live-sweep-s0-full-2026-08-06.md)
- GET status table: [live-sweep-s0-full-2026-08-06.get.csv](./_sweeps/live-sweep-s0-full-2026-08-06.get.csv)
- POST probe table: [live-sweep-s0-full-2026-08-06.post.csv](./_sweeps/live-sweep-s0-full-2026-08-06.post.csv)
- Code adaptation mapping: [code-adaptation-report-s0-2026-08-06.md](./_sweeps/code-adaptation-report-s0-2026-08-06.md)
- Secondary host comparison: [api-delta-s0-vs-nf-normalized-2026-08-06.md](./_sweeps/api-delta-s0-vs-nf-normalized-2026-08-06.md)

## Endpoint Index

### Authentication and Player

- [auth_me.md](./get/auth_me.md)
- [alliances_my.md](./get/alliances_my.md)
- [players_profile.md](./get/players_profile.md)
- [game_config.md](./get/game_config.md)
- [directives.md](./get/directives.md)

### Planet, Research, and Assets

- [planets_list.md](./get/planets_list.md)
- [planet_fleet.md](./get/planet_fleet.md)
- [planets_detail.md](./get/planets_detail.md)
- [planets_activity_summary.md](./get/planets_activity_summary.md)
- [planets_shipyard.md](./get/planets_shipyard.md)
- [research.md](./get/research.md)
- [research_start.md](./post/research_start.md)
- [images.md](./get/images.md)
- [outposts.md](./get/outposts.md)
- [outpost_detail.md](./get/outpost_detail.md)
- [outpost_collect.md](./post/outpost_collect.md)
- [outpost_garrison.md](./post/outpost_garrison.md)
- [outpost_supply.md](./post/outpost_supply.md)
- [outpost_dispatch_mining.md](./post/outpost_dispatch_mining.md)
- [moon_detail.md](./get/moon_detail.md)
- [moon_fleet.md](./get/moon_fleet.md)
- [moon_dispatch.md](./post/moon_dispatch.md)
- [moon_recall.md](./post/moon_recall.md)
- [moon_send.md](./post/moon_send.md)
- [moons_colony_status.md](./get/moons_colony_status.md)

### Fleet and Exploration

- [fleet_missions.md](./get/fleet_missions.md)
- [fleet_fuel_estimate.md](./post/fleet_fuel_estimate.md)
- [fleet_dispatch.md](./post/fleet_dispatch.md)
- [fleet_mine.md](./post/fleet_mine.md)
- [fleet_survey.md](./post/fleet_survey.md)
- [fleet_collect_salvage.md](./post/fleet_collect_salvage.md)
- [fleet_investigate.md](./post/fleet_investigate.md)
- [fleet_collect_debris.md](./post/fleet_collect_debris.md)
- [fleet_expedition.md](./post/fleet_expedition.md)
- [fleet_xeno_survey.md](./post/fleet_xeno_survey.md)
- [fleet_survey_cooldowns.md](./get/fleet_survey_cooldowns.md)
- [fleet_survey_reports.md](./get/fleet_survey_reports.md)
- [fleet_pirate_reports.md](./get/fleet_pirate_reports.md)
- [fleet_spy_reports.md](./get/fleet_spy_reports.md)
- [fleet_camp_scout_reports.md](./get/fleet_camp_scout_reports.md)
- [fleet_mining_reports.md](./get/fleet_mining_reports.md)
- [fleet_expedition_reports.md](./get/fleet_expedition_reports.md)
- [fleet_reports.md](./get/fleet_reports.md)
- [fleet_report_detail.md](./get/fleet_report_detail.md)
- [fleet_wormholes.md](./get/fleet_wormholes.md)
- [fleet_wormhole_runs.md](./get/fleet_wormhole_runs.md)
- [fleet_pirate_camps.md](./get/fleet_pirate_camps.md)
- [system_debris.md](./get/system_debris.md)
- [fleet_patrol_reports.md](./get/fleet_patrol_reports.md)
- [fleet_field_scan_reports.md](./get/fleet_field_scan_reports.md)
- [fleet_colonization_reports.md](./get/fleet_colonization_reports.md)
- [fleet_mine_reports.md](./get/fleet_mine_reports.md)
- [fleet_cyber_reports.md](./get/fleet_cyber_reports.md)
- [fleet_incoming.md](./get/fleet_incoming.md)
- [fleet_stationed_garrisons.md](./get/fleet_stationed_garrisons.md)

### Galaxy and Stations

- [galaxy_map.md](./get/galaxy_map.md)
- [galaxy_arms.md](./get/galaxy_arms.md)
- [galaxy_arm_sectors.md](./get/galaxy_arm_sectors.md)
- [galaxy_sector_systems.md](./get/galaxy_sector_systems.md)
- [galaxy_field_index.md](./get/galaxy_field_index.md)
- [galaxy_system_planets.md](./get/galaxy_system_planets.md)
- [stations_sector.md](./get/stations_sector.md)
- [stations_detail.md](./get/stations_detail.md)
- [galaxy_colony_status.md](./get/galaxy_colony_status.md)

### Market and Trade

- [market_orders.md](./get/market_orders.md)
- [alliance_trade_orders.md](./get/alliance_trade_orders.md)
- [market_hubs.md](./get/market_hubs.md)
- [market_my_balances.md](./get/market_my_balances.md)
- [market_order_fill.md](./post/market_order_fill.md)
- [market_my_trades.md](./get/market_my_trades.md)
- [market_my_orders.md](./get/market_my_orders.md)
- [market_artifacts.md](./get/market_artifacts.md)
- [alliance_trade_hub_status.md](./get/alliance_trade_hub_status.md)

### Logistics

- [logistics_routes.md](./get/logistics_routes.md)
- [logistics_hub_levels.md](./get/logistics_hub_levels.md)
- [logistics_collectible_sources.md](./get/logistics_collectible_sources.md)

### Rankings and Notifications

- [rankings_players.md](./get/rankings_players.md)
- [messages_system.md](./get/messages_system.md)

### Leadership

- [leader.md](./get/leader.md)
- [leader_doctrine.md](./post/leader_doctrine.md)
- [leadership.md](./get/leadership.md)
- [leadership_callsign.md](./post/leadership_callsign.md)
- [leadership_modules_equip.md](./post/leadership_modules_equip.md)
- [leadership_modules_unequip.md](./post/leadership_modules_unequip.md)
- [leadership_move.md](./post/leadership_move.md)
- [leadership_repair.md](./post/leadership_repair.md)
- [leadership_talents_build.md](./post/leadership_talents_build.md)
- [leadership_talents_invest.md](./post/leadership_talents_invest.md)

### Artifacts

- [artifacts.md](./get/artifacts.md)
- [artifacts_definitions.md](./get/artifacts_definitions.md)
- [artifacts_study.md](./post/artifacts_study.md)
- [artifacts_cancel_study.md](./post/artifacts_cancel_study.md)
- [artifacts_activate.md](./post/artifacts_activate.md)
- [artifacts_deactivate.md](./post/artifacts_deactivate.md)
- [artifacts_transcend.md](./post/artifacts_transcend.md)
- [artifacts_discard.md](./post/artifacts_discard.md)
- [fleet_artifact_transfer.md](./post/fleet_artifact_transfer.md)

### Ark and Ark Forge

- [ark.md](./get/ark.md)
- [ark_detail.md](./get/ark_detail.md)
- [ark_announce.md](./post/ark_announce.md)
- [ark_start.md](./post/ark_start.md)
- [ark_cancel.md](./post/ark_cancel.md)
- [ark_labs_attach.md](./post/ark_labs_attach.md)
- [ark_labs_detach.md](./post/ark_labs_detach.md)
- [ark_forge.md](./get/ark_forge.md)
- [ark_forge_convert.md](./post/ark_forge_convert.md)
- [ark_forge_conversion_cancel.md](./post/ark_forge_conversion_cancel.md)

### Combat Simulator

- [combat_simulator_bootstrap.md](./get/combat_simulator_bootstrap.md)
- [combat_simulator_simulate.md](./post/combat_simulator_simulate.md)

### Command Center

- [command_center_fleet_templates.md](./get/command_center_fleet_templates.md)