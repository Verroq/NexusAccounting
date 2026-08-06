# Nexus Legacy API Notes

This folder documents the Nexus Legacy game API capabilities that are currently used or observed by this addon.

## Scope

- Coverage is based on endpoints referenced in the source tree.
- Existing files document endpoints that were already analyzed earlier.
- New files added here document the remaining observed capabilities.
- Some payloads are fully confirmed from TypeScript models.
- Some payloads are partial and marked as inferred when the addon only consumes a subset of fields.

## Confirmed Core Behavior

- Requests are sent with browser session cookies via `credentials: include`.
- The extension rewrites `Origin` and `Referer` for `/api/*` requests so dashboard-originated calls behave like in-game requests.
- Rate-limit headers `ratelimit-limit`, `ratelimit-remaining`, and `ratelimit-reset` are observed and used by the client.

## Endpoint Index

### Authentication and Player

- [auth_me.md](./auth_me.md)
- [alliances_my.md](./alliances_my.md)
- [players_profile.md](./players_profile.md)

### Planet, Research, and Assets

- [planet_fleet.md](./planet_fleet.md)
- [planets_detail.md](./planets_detail.md)
- [planets_shipyard.md](./planets_shipyard.md)
- [research.md](./research.md)
- [images.md](./images.md)

### Fleet and Exploration

- [fleet_missions.md](./fleet_missions.md)
- [fleet_fuel_estimate.md](./fleet_fuel_estimate.md)
- [fleet_survey.md](./fleet_survey.md)
- [fleet_collect_salvage.md](./fleet_collect_salvage.md)
- [fleet_investigate.md](./fleet_investigate.md)
- [fleet_collect_debris.md](./fleet_collect_debris.md)
- [fleet_survey_cooldowns.md](./fleet_survey_cooldowns.md)
- [fleet_survey_reports.md](./fleet_survey_reports.md)
- [fleet_pirate_camps.md](./fleet_pirate_camps.md)
- [system_debris.md](./system_debris.md)

### Galaxy and Stations

- [galaxy_map.md](./galaxy_map.md)
- [galaxy_arms.md](./galaxy_arms.md)
- [galaxy_arm_sectors.md](./galaxy_arm_sectors.md)
- [galaxy_field_index.md](./galaxy_field_index.md)
- [galaxy_system_planets.md](./galaxy_system_planets.md)
- [stations_sector.md](./stations_sector.md)

### Market and Trade

- [market_orders.md](./market_orders.md)
- [market_hubs.md](./market_hubs.md)
- [market_my_balances.md](./market_my_balances.md)
- [market_order_fill.md](./market_order_fill.md)
- [market_my_trades.md](./market_my_trades.md)

### Command Center

- [command_center_fleet_templates.md](./command_center_fleet_templates.md)