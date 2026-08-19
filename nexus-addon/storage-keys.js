// Canonical list of browser.storage.local keys that hold per-universe scraped
// report/aggregate/dedup/archive data. background.js's nsGet/nsSet prefix
// these with `${universe}__` on write; the dashboard side (common.js's nsGet)
// mirrors the same prefix on read, scoped to whichever universe is selected
// for viewing. Kept in one shared module so the write side (background.js)
// and the read side (dashboard.js/common.js/tabs) can't drift out of sync on
// what's namespaced — see ARCHITECTURE.md / the multi-universe migration.
//
// NOT listed here (deliberately left as plain global keys): settings
// (records_cap, selected_universe), ship/shipyard defs (ships, fleet_templates),
// research (research, research_speed_mult, active_research — per-universe
// research is a follow-up, out of scope for now), fuel_log/fuel_counted_ids
// (paired global counters), zone/coords caches (system_zones,
// system_zone_by_id, camp_zones, wormhole_zones, wormhole_classes, etc. —
// technically universe-specific but out of the scope this list was built for;
// see the multi-universe branch's final report for the call-out), and
// spy_reports/camp_scout_reports (consumed only by the separate simulator
// page, not dashboard.js — left global to avoid touching that page).
//
// Archive shard keys (e.g. `survey_archive_2026-06`) are dynamic — namespaced
// directly by appendToArchive/loadArchive/purgeOldData, not listed here.
export const SCOPED_KEYS = [
  // Surveys
  'totals', 'daily', 'hourly', 'resources_lost', 'event_breakdown', 'recent_reports', 'seen_ids',
  // Pirates
  'pirate_totals', 'pirate_daily', 'pirate_resources_lost', 'pirate_outcomes',
  'pirate_debris_total', 'pirate_recent_reports', 'pirate_seen_ids',
  // Mining
  'mining_totals', 'mining_daily', 'mining_resources_lost', 'mining_recent_reports', 'mining_seen_ids',
  // Debris (live fields + precise collection log)
  'debris_fields', 'debris_last_check', 'debris_collected', 'debris_active_runs',
  'debris_collection_log', 'debris_resources_lost', 'debris_collection_ids', 'debris_loss_ids',
  // Expeditions / wormholes
  'exp_totals', 'expedition_totals', 'wormhole_totals', 'exp_daily', 'exp_recent_reports', 'exp_seen_ids',
  'expedition_resources_lost', 'wormhole_resources_lost',
  // Xeno (ruins survey)
  'xeno_totals', 'xeno_daily', 'xeno_recent_reports', 'xeno_resources_lost', 'xeno_seen_ids',
  // PvP
  'pvp_recent_reports', 'pvp_seen_ids',
  // Archive index (the dynamic per-month shard keys it points to are namespaced separately)
  'archive_index',
  // Scrape status
  'last_scrape', 'last_error', 'stats_drift',
];
