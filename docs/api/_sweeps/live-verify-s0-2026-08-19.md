# S0 Live Doc-Verification Sweep — 2026-08-19

Generated: 2026-08-19 (America/... local session time, see git log for exact commit time)

Read-only GET-only sweep re-validating `docs/api/*.md` against live responses on
`https://s0.nexuslegacy.space`, using a confirmed-working `kind:"game"`,
`universeKey:"s0"` bearer token (never logged/committed — see repo CLAUDE.md
auth notes). No POST/PUT/PATCH/DELETE requests were issued.

## Context

- base: `https://s0.nexuslegacy.space`
- userId: 428
- planetId: 29925 (homeworld "Terra", systemId 577)
- other owned planetIds used for extra probes: 92841, 32268, 42432, 89639, 79516
- systemId: 577
- armId: 3
- sectorId: 101
- moonId: 45110 (owned moon "Negi's Mom-b", also probed 125918)
- outpostId: 654 (discovered live — see Notable Finding below)
- reportId: not probed (no `/api/fleet/reports/{id}` call made; report ids observed in `/api/fleet/reports` list)

## Summary

- **61 live GET requests** issued across 55 distinct endpoints (some endpoints
  probed with 2+ IDs to compare shapes).
- **All 61 requests returned HTTP 200.** No endpoint that docs mark as `GET`
  returned a non-200 status in this sweep.
- **38 endpoints have a matching `docs/api/*.md` file** and were diffed key-by-key
  against the doc's documented "Response Structure" example.
- **14 of those 38 matched the doc exactly** (no new/missing top-level or
  one-level-deep keys): `moon_fleet`, `fleet_survey_cooldowns`,
  `fleet_pirate_reports`, `fleet_camp_scout_reports`, `fleet_expedition_reports`,
  `fleet_wormholes`, `fleet_wormhole_runs`, `fleet_pirate_camps`, `system_debris`,
  `galaxy_arms`, `galaxy_arm_sectors`, `market_my_balances`, `market_my_trades`,
  `command_center_fleet_templates` — see full table below for the authoritative
  per-endpoint result.
- **22 endpoints show additive drift** (new fields the docs don't mention yet;
  no removed/renamed fields and no type changes were found anywhere), plus
  **2 endpoints (`outposts`, `moon_detail`) show major drift** where the doc's
  own example data (empty arrays / a bare new moon) undersells a much richer
  real shape — see the Notable Finding section below.
- **16 live-reachable endpoints have no corresponding `docs/api/*.md` file at all**
  (they match the `CLAUDE.md` endpoint inventory but were apparently never
  written up), including the newly-flagged `/api/game-config`.
- **6 documented endpoints are no longer referenced anywhere in `nexus-addon/*.js`**
  (dead docs, not dead endpoints — all 6 still returned 200 live).
- Several mutating endpoints were intentionally **not probed** — see the
  "Skipped (potentially mutating)" section.

---

## GET Checks vs. Documented Endpoints

| Endpoint | Status | Doc file | Drift? |
|---|---:|---|---|
| /api/auth/me | 200 | auth_me.md | Minor — `planets[]` items gained `sortOrder`, `securityZone` |
| /api/planets | 200 | planets_list.md | Minor — `planets[]` items gained `sortOrder` |
| /api/planets/29925/fleet | 200 | planet_fleet.md | Moderate — top-level gained `resourceSnapshot`, `resources` |
| /api/planets/29925 | 200 | planets_detail.md | Moderate — top-level gained `buildQueueCount`, `buildQueueMax`, `buildSpeedMult`, `deadSpaceShieldEnabled`, `productionBreakdown`, `productionMultiplier`, `starterProductionMultiplier`, `systemInfo`; `planet` object gained `sortOrder`, `productionRateVersion`, `deadSpaceShieldSuppressedUntil`; `buildings[]` items gained PvP-repair fields |
| /api/planets/29925/shipyard | 200 | planets_shipyard.md | Moderate — top-level gained the whole build-queue block: `maxQueueSize`, `orbitalQueue`, `orbitalQueueAll`, `orbitalQueueCount`, `orbitalShipScrapSpeedMult`, `orbitalShipSpeedMult`, `planetaryQueue`, `planetaryQueueAll`, `planetaryQueueCount`, `shipScrapSpeedMult`, `shipSpeedMult` |
| /api/research?planetId=29925 | 200 | research.md | Moderate — top-level gained `activeResearch`, `activeResearches`, `researchSpeedMult`, `precursorFragmentEffectBonus`, `precursorFragmentEffectMultiplierBonus` |
| /api/outposts | 200 | outposts.md | **Major (data, not shape)** — see Notable Finding below |
| /api/moons/45110 | 200 | moon_detail.md | Major — the doc's example was for an empty/new moon; a colonized moon returns a much richer `moon` object (full economy: `ore/silicates/hydrogen/alloys` + rates, `cryoIce/quantumDust/plasmaCore/bioExtract/darkMatter/antimatter` + rates, `storage`, timestamps) plus new top-level `resourceSnapshot`, `parentPlanetResources`, `userMoons`, `jumpCooldownMs`, `securityZone`, `serverNow` |
| /api/moons/45110/fleet | 200 | moon_fleet.md | None (empty `fleet: []`, matches doc; doc's only prior sample was a 403 for a non-owned moon) |
| /api/fleet/missions | 200 | fleet_missions.md | Minor — `missions[]` items gained `hangarAssignments`, `leadershipVessel`, `sourceMoonId`, `sourceOutpostId`, `sourceStationId`, `targetFleetMissionId`, `targetMoonId`, `targetSectorId` (logistics/moon/outpost mission support) |
| /api/fleet/survey-cooldowns | 200 | fleet_survey_cooldowns.md | None |
| /api/fleet/survey-reports | 200 | fleet_survey_reports.md | Minor — top-level gained `restedStatus`, `unreadCount`; `reports[]` items gained `requiresDeadPlanetOrigin` |
| /api/fleet/pirate-reports | 200 | fleet_pirate_reports.md | None |
| /api/fleet/spy-reports | 200 | fleet_spy_reports.md | Minor — `reports[]` items gained many target-context fields (`targetPlanetId/Name`, `targetMoonId/Name`, `targetStationId/Name`, `targetFieldId/Name`, `targetSystemId`, `targetUserId`, `targetAllianceTag`, `targetAvatarUrl`, `targetPortraitFrame`, `missionId`, `expiresAt`, `isSaved`, `userId`) |
| /api/fleet/camp-scout-reports | 200 | fleet_camp_scout_reports.md | None (empty `reports: []` on this account) |
| /api/fleet/mining-reports | 200 | fleet_mining_reports.md | Minor — `reports[]` items gained `cargoStolen`, `combatLog`, `cycleCount`, `drillBreakdowns`, `fleetComposition`, `isRead`, `locationName`, `miningCargoCapacityTotal`, `pirateFleet` |
| /api/fleet/expedition-reports | 200 | fleet_expedition_reports.md | None |
| /api/fleet/reports | 200 | fleet_reports.md | Minor — `reports[]` items gained `attackerId`, `attackerLosses`, `defenderId`, `defenderLosses`, `isRead`, `isSaved`, `lootStolen`, `missionId`, `moonId`, `planetId`, `planetName` (doc's example list item looks like a stub/truncated sample) |
| /api/fleet/wormholes | 200 | fleet_wormholes.md | None (empty on this account) |
| /api/fleet/wormhole-runs | 200 | fleet_wormhole_runs.md | None |
| /api/fleet/pirate-camps | 200 | fleet_pirate_camps.md | None (empty on this account) |
| /api/fleet/system-debris | 200 | system_debris.md | None (empty on this account) |
| /api/market/hubs | 200 | market_hubs.md | Minor — `hubs[]` items gained location/security metadata (`armId`, `armName`, `commissionRate`, `isActive`, `sectorIndex`, `securityZone`, `starType`, `systemId`, `systemName`, `systemX`, `systemY`) |
| /api/market/my-balances | 200 | market_my_balances.md | None |
| /api/market/orders?page=1&limit=25 | 200 | market_orders.md | Minor — `orders[]` items gained `baseAmount`, `baseRemaining`, `baseResource`, `limitPrice`, `quoteAmount`, `quoteResource`; `pagination` gained `limit`, `offset`, `total` |
| /api/alliance-trade/orders?page=1&limit=25 | 200 | alliance_trade_orders.md | Minor — `orders[]` items gained artifact-order fields (`offerArtifactId/Name/Tier`) and location fields (`armName`, `planetPosition`, `sectorIndex`, `systemX`, `systemY`) |
| /api/market/my-trades | 200 | market_my_trades.md | None |
| /api/galaxy/arms | 200 | galaxy_arms.md | None |
| /api/galaxy/arms/3/sectors | 200 | galaxy_arm_sectors.md | None |
| /api/galaxy/sectors/101/systems | 200 | galaxy_sector_systems.md | Minor — `systems[]` items gained `armId`, `colonizedCount`, `isMarketHub`, `isRiftCore`, `requiresDeadPlanetOrigin`, `seed` |
| /api/galaxy/field-index | 200 | galaxy_field_index.md | Minor — `systems[]` items gained a large set of richness/quest metadata (`allianceLocked`, `fieldCount`, `fieldType`, `minRichness`/`maxRichness`, `questKey`, `richestFieldId/Name`, `securityZone`, `systemName`, `systemX/Y`, `totalCapacity`, `totalRemaining`) — doc's example is clearly a stub (`{"systemId": 5750}` only) |
| /api/galaxy/systems/577/planets | 200 | galaxy_system_planets.md | Minor — top-level gained `hasCivilization`, `included`, `planetCount`, `visibility`; `planets[]`/`moons[]` items gained owner-display fields (`ownerAvatarUrl`, `ownerAllianceTag`, `ownerPortraitFrame`, `ownerRace`, `ownerIsVacationMode`, `deadSpaceShieldActive`, `shieldReinforcedUntil`, `colonizedAt`); doc's example items use `systemId` per-item which live responses omit (system id is implied by the request path) |
| /api/galaxy/map | 200 | galaxy_map.md | Minor — top-level gained `userSystemIds`; `systems[]` items gained `hasColonies`, `name`, `requiresDeadPlanetOrigin`, `starType` |
| /api/stations/sector/101 | 200 | stations_sector.md | Minor — `stations[]` items gained `captureProtectedUntil`, `resourceRevision`, `totalGarrison`, `turretHp`/`turretMaxHp`, `withdrawAccessRole` |
| /api/rankings/players | 200 | rankings_players.md | Minor — `leaderboard[]` items gained `allianceIconKey`, `allianceId`, `avatarUrl`, `portraitFrame`, `title` |
| /api/messages/system | 200 | messages_system.md | Minor — `notifications[]` items gained `senderAvatar` |
| /api/command-center/fleet-templates | 200 | command_center_fleet_templates.md | None |
| /api/alliances/my | 200 | alliances_my.md | Minor — `alliance` object gained several alliance-governance fields (`allyPactCooldownUntil`, `disbandRequestedAt/By`, `disbandScheduledAt`, `pendingVulnerabilityEffectiveAt`, `pendingVulnerabilityWindowStartMinute`, `stationCapture`, `stationCaptureBlockedUntil`, `territories`, `vulnerabilityWindowChangedAt`, `vulnerabilityWindowStartMinute`) |
| /api/players/428/profile | 200 | players_profile.md | Minor — `profile` object gained `alliance`, `isSelf`, `rewardCosmetics` |

## Notable Finding: `/api/outposts` now returns real data

`docs/api/outposts.md` documents the response shape as
`{"outposts": [], "resourceSnapshots": []}` with a note that "current account
sample returned empty arrays." That is no longer true for this account: it now
owns **5 outposts** (e.g. outpost id `654`, type `mining_outpost`, level 2,
system 6825), and both arrays are populated with rich, fully undocumented item
schemas:

- `outposts[]` items: `id, userId, systemId, asteroidFieldId, localOrbit, name,
  outpostType, level, ore/silicates/hydrogen/alloys/cryoIce/quantumDust/
  plasmaCore/bioExtract/darkMatter (+ *Rate variants), basicStorage,
  rareStorage, shieldHp/shieldMaxHp, garrison, hangarAssignments, hp/maxHp,
  isConstructing, constructionEndsAt/JobId/Type, pendingBuildingKey,
  isRelocating, isDrifting, shieldReinforcedUntil, lastRenamedAt,
  resourcesUpdatedAt, resourceRevision, productionRateVersion, createdAt,
  buildings[] (id, outpostId, buildingKey, level), asteroidField,
  deployedShipCount, leadershipVessel, orbitDefense, totalOrbitDefense
  {total, damaged}, systemX, systemY`
- `resourceSnapshots[]` items: `locationType, locationId, revision, serverNow,
  resourcesUpdatedAt, resources{...}, productionRates{...}, storage{...},
  energy{produced, consumed}, productionBudget, productionMultiplier,
  starterProductionMultiplier`

`nexus-addon/logistics-view.js` (lines ~179, 782, 795-796) already calls
`/api/outposts` and `POST /api/outposts/{id}/collect|supply|garrison`, so the
addon is actively consuming this endpoint — the doc is stale on real-world
shape, not just incomplete on paper. This is the single highest-value doc
update to make. (The `outpost_collect.md` / `outpost_garrison.md` /
`outpost_supply.md` POST docs were **not** live-probed per the read-only
safety rule, but their notes claiming "no outpost ID was available" are now
also stale — a human should re-check those write-docs separately with a
sandboxed/low-stakes outpost if one is ever available.)

---

## New Undocumented Endpoint: `/api/game-config`

Confirmed live with `GET https://s0.nexuslegacy.space/api/game-config`,
`200 OK`:

```json
{"universeKey":"s0","gameSpeed":1,"fleetSpeed":1,"miningSpeed":1}
```

- Not referenced in any `docs/api/*.md` file, not referenced anywhere in
  `nexus-addon/*.js` or `nexus-addon/tabs/*.js`.
- Confirmed reachable with a **lobby-kind token as well** (per task context),
  so this is likely a pre-session/universe-selection endpoint — useful for the
  addon to detect per-universe speed multipliers (relevant to ETA/cooldown
  math) before or independent of the per-universe game session. Worth adding
  a `docs/api/game_config.md` and considering a `background.js` fetch during
  universe/session bootstrap.

---

## Endpoints Live-Reachable but Undocumented (no `docs/api/*.md`)

All returned 200 and match the `CLAUDE.md` endpoint inventory, but have no
`docs/api/*.md` file (excluding `docs/api/_sweeps/` archives) and are not
called anywhere in `nexus-addon/*.js`:

| Endpoint | Top-level shape |
|---|---|
| /api/game-config | `universeKey, gameSpeed, fleetSpeed, miningSpeed` (see above — flagged separately per task) |
| /api/fleet/colonization-reports | `reports, unreadCount` |
| /api/fleet/mine-reports | `reports, unreadCount` |
| /api/fleet/cyber-reports | `reports, unreadCount` |
| /api/fleet/stationed-garrisons | array, empty on this account |
| /api/fleet/incoming | `incoming` |
| /api/planets/activity-summary | `planets` |
| /api/directives | `directives, completedKeys, journalEnabled, journal` |
| /api/alliance-trade/hub-status | `hasTradeHub, hubOwner, hubPlanet, hubLevel, activeOrderCount, orderCapacity` |
| /api/market/my-orders | array, 4 items on this account |
| /api/market/artifacts | `listings, pagination` |
| /api/logistics/routes | `routes` |
| /api/logistics/hub-levels | `hubLevels` |
| /api/logistics/collectible-sources | `outposts, moons, stations` |
| /api/galaxy/colony-status | `currentColonies, maxColonies, canColonize, hasColonizationTech, colonyShipSources, colonyShipDefId, tankerShipDefId` |
| /api/moons/colony-status | `colonizedMoons, maxMoons, canColonize, hasLunarOperations, shuttleSources` |

These were all in `CLAUDE.md`'s endpoint list already, so they're "known but
never written up" rather than newly discovered — worth a documentation pass
if the addon ever grows features that need them (e.g. `directives` for a
quest tracker, `activity-summary` for the aggregation dashboard this repo's
CLAUDE.md says is the whole point of the project).

## Documented Endpoints No Longer Referenced in `nexus-addon/*.js`

These `docs/api/*.md` files exist and their endpoints are still live (all
200), but no code in `nexus-addon/*.js` or `nexus-addon/tabs/*.js` calls them
(checked via `grep -rE "/api/..."` plus targeted string search for each
endpoint's URL fragment):

- `market_my_balances.md` (`/api/market/my-balances`)
- `market_my_trades.md` (`/api/market/my-trades`)
- `galaxy_field_index.md` (`/api/galaxy/field-index`)
- `players_profile.md` (`/api/players/{userId}/profile`)
- `stations_sector.md` (`/api/stations/sector/{sectorId}`)
- `command_center_fleet_templates.md` (`/api/command-center/fleet-templates`)

Not necessarily a problem — these may be intentionally documented ahead of a
planned feature — but flagging per task instructions.

## Code References With Matching Docs (no gaps found)

Every `/api/...` path found via `grep -rohE "/api/[a-zA-Z0-9_\-/{}\$]+"` across
`nexus-addon/*.js` and `nexus-addon/tabs/*.js` has a corresponding
`docs/api/*.md` file. No "referenced in code but undocumented" gaps were
found this sweep.

## Stale Auth Detail (context, not part of this sweep's scope)

Per task context: `nexus-addon/background.js:478` currently looks for a
cookie named `nexus_token`, but the per-universe session is now delivered via
`__Host-nexus-game`. This sweep used a manually-supplied bearer token and did
not touch cookie handling — flagging only because it's directly relevant to
why a "fresh token" was needed for this sweep in the first place. Not fixed
here; separate task.

---

## Skipped (potentially mutating — not probed)

Per the read-only safety rule, no POST/PUT/PATCH/DELETE request was issued.
Endpoints in `docs/api/*.md` that are POST (or otherwise mutating) were
skipped entirely:

`fleet_dispatch.md`, `fleet_mine.md`, `fleet_survey.md`,
`fleet_collect_salvage.md`, `fleet_investigate.md`, `fleet_collect_debris.md`,
`fleet_expedition.md`, `fleet_xeno_survey.md`, `fleet_fuel_estimate.md`,
`research_start.md`, `outpost_collect.md`, `outpost_garrison.md`,
`outpost_supply.md`, `moon_dispatch.md`, `moon_recall.md`, `moon_send.md`,
`market_order_fill.md`.

`fleet_report_detail.md` (`GET /api/fleet/reports/{id}`) was also skipped —
not mutating, but no specific report id was selected/cached during this sweep
(report ids are visible in the `/api/fleet/reports` list already validated
above), so it was left for a future targeted check rather than probed
speculatively.

`images.md` (`/api/images/*`) was skipped as out of scope — static asset
paths, not JSON API responses, already noted as deterministic in the doc.

---

## Method Notes

- Auth: `Authorization: Bearer <token>` header on every request (matches
  `nexus-addon/background.js`'s `apiFetch()` pattern), using a pre-verified
  `kind:"game"`, `universeKey:"s0"` token supplied out-of-band. Token value
  was never printed, logged, or committed.
- IDs (`userId`, `planetId`, `systemId`, `armId`, `sectorId`, `moonId`,
  `outpostId`) were discovered via `/api/auth/me`, `/api/planets`, and
  `/api/galaxy/systems/{id}/planets` (moons array) and cached/reused rather
  than re-derived per call.
- ~150-250ms delay between requests; no 429s were encountered at any point in
  this sweep (61 requests total, well under the documented fuel-estimate/
  system-details rate caps — and fuel-estimate/system-details were not called
  since fuel-estimate is POST-only and there's no separate `system-details`
  GET endpoint distinct from `planets/{id}`).
- Comparison method: live JSON top-level keys, plus one level deep into
  nested objects and the first item of array fields, diffed against the keys
  present in each doc's first fenced ` ```json ` "Response Structure"
  example block.
