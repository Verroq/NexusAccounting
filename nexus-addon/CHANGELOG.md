# Changelog

All notable changes to the Nexus Accounting Firefox addon.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.5.4] - 2026-06-17

### Added
- Fuel cost estimate folded into net gain. Each survey, pirate, and mining
  report now estimates the round-trip hydrogen burned
  (`Σ(fuelRate×qty) × (0.0517×galaxyDist + 9.24)`, fitted to real send-fleet
  costs) and subtracts it from the Hydrogen and Total net. Survey shows a
  "Fuel spent est." card too.
- Galaxy map caches system coordinates; pirate-camps cache coordinates; the
  home system id is cached — all to measure travel distance.

### Notes
- Fuel needs a fresh Scrape Now to populate the new ship/coordinate fields,
  and only applies to newly scraped reports. Survey fuel uses an assumed
  fleet by zone (the report omits the fleet sent). Reports whose target
  system is unexplored show no fuel.

## [1.5.3] - 2026-06-16

### Added
- Combat simulator now shows a round-by-round "sample battle" (one
  representative run): ships and HP% per side each round, kills, and the
  sample outcome — alongside the Monte-Carlo averages.
- Fuel estimate for the attacking fleet: enter a distance (AU), optional
  round-trip, and get total hydrogen from each ship's fuel rate.

### Changed
- Rapid-fire table rebuilt from the exact in-game ship screens (fighter
  and carrier entries added; cruiser, battleship, bomber, interceptor
  values corrected).
- Rapid fire and ship stats now resolve pirate/NPC ships (e.g.
  "Pirate Fighter") to their base class, so the engine can simulate
  wormhole/pirate fleets and the validator can replay those reports.
- Ship catalog now stores fuel rate and cargo capacity.

## [1.5.2] - 2026-06-15

### Fixed
- Widened host permissions to `*://*.nexuslegacy.space/*` so a single grant
  covers the `s0` (and any future universe) subdomain. Previously only the
  apex was granted on Firefox, leaving the API host unauthorized — every
  request was CORS-blocked and the addon reported "not logged in" with no
  data.
- `getToken` now searches every cookie store (Firefox containers, private
  windows) and domain-wide, not just the default store with two exact URLs.
- API errors now name the failing endpoint (network/CORS failures included).

### Added
- Planet Finder: Max size, temperature range, security-zone, and
  "exclude mine" filters; Zone and Distance-from-home columns (sortable).
- A flaky system during a scan is now skipped and counted instead of
  aborting the whole scan.
- Galaxy map is now interactive: drag to pan, wheel to zoom toward the
  cursor; clicking a results row centers and rings that system. Matches
  table moved above the map.
- Map markers: your planets show a light-green aura; alliance-owned
  systems found while scanning get the same aura with the player's name;
  market hubs are drawn as yellow diamonds.
- Owner-only galaxy export/import: share scanned-planet knowledge as a
  JSON file, merged by freshest scan per system. Imported systems become
  searchable even if you haven't explored them.

## [1.5.1] - 2026-06-15

### Changed
- Tech Tree depth now factors in the required laboratory level as a
  tiebreak: depth = max(prerequisite-chain depth, lab-level floor), so
  lab-gated techs sink to their lab tier instead of bunching at the top
  when they have no research prerequisites.

## [1.5.0] - 2026-06-15

### Added
- Tech Tree tab: renders `/api/research` as a top-to-bottom dependency
  graph (OGame style). Rows are prerequisite depth; prerequisites sit
  above their dependents.
- Long edges route through invisible waypoints merged per source into
  vertical buses, so dependencies weave around nodes instead of crossing
  them. Crossing reduction uses barycenter (mean + median) with
  adjacent-transpose refinement, keeping the lowest-crossing ordering.
- Rounded orthogonal edges coloured by prerequisite branch, dashed/faded
  when the prereq is unmet, arrowheads into dependents.
- Nodes show branch accent + status; researchable-now techs glow, locked
  techs recede. Tier labels, row bands, and a legend aid orientation.
- Interaction: hover/click-pin chain highlight, drag-pan, wheel zoom,
  fit-to-width, branch filter, and search-to-highlight.

## [1.4.0] - 2026-06-15

### Changed
- Migrated to Manifest V3 and made the addon work on both Firefox and Chrome
  from one codebase (webextension-polyfill, MV3 service worker / event page,
  `action`, split host permissions).
- Realtime updates now use an observe-and-re-fetch trigger
  (`webRequest.onCompleted`) instead of Firefox-only response-body reading,
  which MV3 removed. Still near-realtime; costs one extra request per change.
- `build.py` emits both the `.xpi` (Firefox) and a `.zip` (Chrome Web Store).
- Auto-backups download from a data URL (service workers have no
  `URL.createObjectURL`).

## [1.3.4] - 2026-06-15

### Changed
- Net gain and resources-lost now include the repair cost of damaged ships
  (50% of build cost), not just destroyed ones. Surveys and pirate raids
  track damage per ship type for this.

## [1.3.3] - 2026-06-15

### Fixed
- Combat simulator rapid fire was dumping all of a unit's shots into one
  target, wasting most on overkill — rapid-fire swarms (e.g. interceptors)
  badly underperformed. Each shot now picks its own target and skips ships
  already lethally hit that round, validated against a third real battle.

## [1.3.2] - 2026-06-13

### Changed
- Published on addons.mozilla.org (listed channel). AMO now signs,
  distributes and auto-updates the addon; the short-lived self-hosted
  `update_url`/`updates.json` channel from 1.3.1 is removed.
- `build.py --sign` submits to the listed channel.

## [1.3.1] - 2026-06-13

### Added
- **Automatic backups** to `Downloads/NexusAccounting/`: weekly while
  scraping, and before every destructive operation — reset, import,
  schema-fallback wipe and version updates. Requires the new `downloads`
  permission.
- **Rebuild stats**: recomputes every aggregate losslessly from uncapped
  report archives (sharded by month so a scrape only rewrites the current
  month). The records cap now only bounds the UI tables.
- **Drift detection**: archive-derived sums are checked against stored
  totals after each scrape; mismatches surface a warning in the status bar.
- **Import validation**: backups are shape-checked before anything is
  replaced.
- Storage footer: archived report count, storage size, last backup date.
- Node test suite (`npm test`): combat-engine calibration regression tests
  and processor tests (dedupe, shards, migration, drift/rebuild).

### Changed
- Schema changes now migrate data in place (`MIGRATIONS` map); a wipe is the
  last resort and preserves the records cap, which only the user changes.
- Combat engine extracted to `engine.js`; dashboard split into `common.js`,
  `tabs/*.js` and an orchestrator; simulator split into core, intel and
  validation files.

## [1.3.0] - 2026-06-13

### Added
- **Mining tab**: deliveries, mining cycles, drill breakdowns, ambush ship
  losses (valued at build cost) and cargo stolen, with per-period chart.
- **Debris tab**: live debris fields snapshotted from `system-debris`,
  estimated collected amounts inferred from snapshot diffs, plus debris
  generated by your own pirate raids.
- **Expeditions tab**: expedition reports and wormhole runs merged — loot,
  losses, per-period chart (shape-tolerant parsing, endpoints unobserved yet).
- **Planet Finder tab**: full-galaxy map with region highlight; filters by
  arm, sector (single or range), planet type, min size, min moons and
  ownership; scans explored systems with a 24h cache; sortable results and
  hover tooltips on matches.
- Simulator: **Load my fleet** fills the attacker from your stationed ships.
- Simulator: **intel auto-fill** — defender fleet and turret/shield/EW levels
  load from spy or camp-scout reports; target resources shown with an
  estimated cargo requirement for ~50% loot.
- Simulator: **planetary defenses** — turret structure, always-regenerating
  shield generator and EW damage reduction (estimates); bombers keep their
  exact ×5 rapid fire vs defense buildings.
- Simulator: **engine validation** — replays recorded pirate raids and
  reports outcome accuracy and average loss error against real results.
- `build.py` builds the versioned xpi from the manifest.

### Changed
- Home planet is discovered via `/api/planets` and cached (no hardcoded id);
  recolonization self-heals on 404.
- Mining and Expeditions tabs honor the All time / Daily / Hourly view mode.
- Intel report retention raised to 200; spy, camp-scout, mining, expedition,
  wormhole and system-debris endpoints added to realtime interception.
- View mode and records cap controls hidden on tabs where they are
  meaningless (Planet Finder, Debris).

## [1.2.1] - 2026-06-10

### Added
- **Realtime updates**: the addon now intercepts the game's own API responses
  (survey reports, pirate reports, shipyard) via `webRequest.filterResponseData`
  and processes them immediately — the dashboard updates seconds after you open
  a report in game. The 15-minute scrape remains as fallback for when no game
  tab is open.
- **JSON export/import** on the dashboard: full backup of all aggregated data
  to a dated file, restore with confirmation. Protects history the game API no
  longer returns.
- Simulator: **research levels** (0–5) per side with exact in-game rates —
  weapon damage techs, hull techs, shield HP, and damage reduction
  (Shield Theory / Adaptive Shields / Advanced Shielding, stacks to 35%).
- Simulator: ship stat lines update live as research levels change.
- Simulator: average survivors shown next to each ship input after a run;
  auto-scroll to results.

### Changed
- Simulator targeting calibrated against real battle reports (partial
  focus-fire); default round cap raised to 10; options moved above the fleets.
- Dreadnought and Titan rapid-fire values are now exact (from in-game ship
  screens).
- "Resources collected" cards ordered Ore / Silicates / Hydrogen to match
  the resources-lost cards.
- Background page is persistent and requires the `webRequest` /
  `webRequestBlocking` permissions (needed for response interception).

### Fixed
- `package.json` license said MIT while the project is MPL-2.0.

## [1.2.0] - 2026-06-10

### Added
- **Combat simulator** (`simulator.html`, linked from the dashboard):
  Monte Carlo battle engine modeled on the official combat guide — round-based
  simultaneous fire, weapon-vs-armor matchups, rapid fire, plasma/ion shield
  burn, win/hold/mutual-destruction rates, expected losses and debris value.
  Debris rate (30% of destroyed ship cost) verified against real pirate
  reports.
- Ship catalog now stores combat stats (HP, shield, attack, weapon/armor type)
  for the simulator.

## [1.1.0] - 2026-06-10

### Added
- **Pirates tab**: aggregates pirate camp raids from
  `/api/fleet/pirate-reports` — loot collected, attacker ships destroyed and
  damaged (build-cost valuation of losses), pirates destroyed, outcome
  breakdown, debris fields generated, daily/hourly views and raid history
  table.

## [1.0.1] - 2026-06-10

### Fixed
- Skip uninvestigated anomalies and uncollected loot until fully resolved —
  reports are counted once, with their final loot.
- `ships_lost` counted array entries instead of summing quantities.
- Pagination buttons (CSP-safe event listeners instead of inline `onclick`).

## [1.0.0] - 2026-06-09

### Added
- Initial release: tracks Nexus Legacy survey reports — resources collected
  (ore, silicates, hydrogen), missions, ships lost with build-cost valuation,
  event type breakdown, daily/hourly charts, report history with configurable
  records cap, 15-minute background scrape with manual "Scrape Now".
