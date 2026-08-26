# Client-Bundle Endpoint Discovery - 2026-08-26

The game front-end is a Vite SPA whose entry bundle lazy-loads 76 JS chunks (~16 MB). Every
endpoint the official client can call is a string literal in those chunks, so pulling them
gives a complete inventory of the API surface rather than only the parts this addon happens
to use.

## How this was produced

1. `GET https://s0.nexuslegacy.space/` -> `/assets/index-*.js`, then follow every `./*.js`
   import transitively (76 chunks).
2. Extract every `.get|.post|.put|.patch|.delete("<path>")` call argument. The client's axios
   instance uses `baseURL=/api`, so the literals are `/fleet/missions`, not `/api/fleet/missions`.
3. Normalise `${...}` interpolations and numeric segments to `{id}`, then subtract the
   endpoints already covered by `docs/api/{get,post}/*.md`.
4. Live-probe every resulting **GET** whose path ids could be filled from the sweep account.
   No POST/PUT/PATCH/DELETE was issued.

## Result

- **434 distinct endpoints** are reachable from the official client.
- **106 of them now have a `docs/api/{get,post}/*.md` file** - the combat-simulator,
  leadership, artifacts, Ark / Ark Forge and outpost mining sets were written up after this
  discovery pass.
- **328 do not** - listed below.
- Four documented endpoints do not appear in the client bundle: `/api/game-config`,
  `/api/planets`, `/api/research` and `/api/images/*` (the client builds those paths
  differently, e.g. `/research?planetId=` and image URLs assembled from templates).
- **101 undocumented GETs were probed live; 66 returned `200`.** The rest are explained:
  `403` = admin or Command Center access required, `404` = lobby-host endpoint (not served by
  the per-universe host), `400` = missing query parameter or missing in-game prerequisite,
  `503` = store backend disabled on this universe.

The `Shape` column lists the top-level keys of the live `200` response, so a doc can be
written for any of these without re-probing.

## Account

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/auth/language` | PATCH | - |  |
| `/auth/link/discord/sync-role` | POST | - |  |
| `/auth/link/password` | POST | - |  |
| `/auth/link/steam` | POST | - |  |
| `/auth/linked-methods` | GET | 404 | (empty object) |
| `/auth/me/email-preferences` | PATCH | - |  |
| `/auth/me/export` | GET | 404 | (empty object) |
| `/auth/oauth/apple/link` | POST | - |  |
| `/auth/profile-deletion` | GET | 200 | `pending`, `requestedAt`, `scheduledAt`, `deletedAt`, `canConfirm`, `delayHours` |
| `/auth/profile-deletion/cancel` | POST | - |  |
| `/auth/profile-deletion/confirm` | POST | - |  |
| `/auth/profile-deletion/request` | POST | - |  |
| `/auth/referral` | GET/PATCH | 404 | (empty object) |
| `/auth/referral-campaign/redeem` | POST | - |  |
| `/auth/request-password-reset` | POST | - |  |
| `/auth/reset-password` | POST | - |  |
| `/auth/spoken-languages` | PATCH | - |  |
| `/auth/steam-link/confirm` | POST | - |  |
| `/auth/unlink/{id}` | POST | - |  |
| `/auth/username` | PATCH | - |  |
| `/auth/vacation` | GET/POST | 200 | `active`, `startedAt`, `until`, `minUntil`, `nextAvailableAt`, `minDays`, `maxDays`, `cooldownDays`, `blockers` |
| `/auth/vacation/end` | POST | - |  |
| `/auth/{id}fa/confirm` | POST | - |  |
| `/auth/{id}fa/disable` | POST | - |  |
| `/auth/{id}fa/setup` | POST | - |  |
| `/ban-appeal` | POST | - |  |
| `/ban-appeal/active` | GET | 404 | (empty object) |
| `/ban-appeal/admin` | GET | 404 | (empty object) |
| `/ban-appeal/admin/{id}` | PATCH | - |  |
| `/players/me/profile` | PATCH | - |  |
| `/polls/current` | GET | 200 | `poll` |
| `/polls/{id}/vote` | POST | - |  |
| `/push/fcm-subscribe` | POST | - |  |
| `/push/preferences` | GET/PATCH | 200 | `preferences` |
| `/push/public-key` | GET | 200 | `publicKey` |
| `/push/status` | POST | - |  |
| `/push/subscribe` | POST | - |  |
| `/push/unsubscribe` | POST | - |  |
| `/security/signal` | POST | - |  |
| `/universes` | GET | 404 | (empty object) |
| `/universes/{id}/hall-of-fame` | GET | - |  |
| `/universes/{id}/join` | POST | - |  |
| `/universes/{id}/my-profile` | GET | - |  |

## Admin (403 without admin role)

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/admin/analytics` | GET | 403 | `error`, `code` |
| `/admin/announcements` | GET/POST | 403 | `error`, `code` |
| `/admin/announcements/{id}` | DELETE/PUT | - |  |
| `/admin/changelog` | GET/POST | 403 | `error`, `code` |
| `/admin/changelog/{id}` | DELETE/PUT | - |  |
| `/admin/email/campaigns/new-frontier` | GET | 403 | `error`, `code` |
| `/admin/email/campaigns/new-frontier/send` | POST | - |  |
| `/admin/email/inbox` | GET | 403 | `error`, `code` |
| `/admin/email/inbox/{id}` | GET | - |  |
| `/admin/email/inbox/{id}/reply` | POST | - |  |
| `/admin/polls` | GET/POST | 403 | `error`, `code` |
| `/admin/polls/{id}` | DELETE/PUT | - |  |
| `/admin/polls/{id}/results` | GET | - |  |
| `/admin/polls/{id}/{id}` | POST | - |  |
| `/admin/security` | GET | 403 | `error`, `code` |
| `/admin/stats` | GET | 403 | `error`, `code` |
| `/admin/subscribers` | GET | 403 | `error`, `code` |
| `/admin/universes` | GET | 403 | `error`, `code` |
| `/admin/users/{id}/ban` | POST | - |  |
| `/admin/users/{id}/grant` | POST | - |  |
| `/admin/users/{id}/revoke` | POST | - |  |
| `/admin/users/{id}/unban` | POST | - |  |
| `/admin/users{id}` | GET | - |  |

## Alliance

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/alliance-trade/history` | GET | 200 | `history` |
| `/alliance-trade/orders/{id}/cancel` | POST | - |  |
| `/alliance-trade/orders/{id}/fill` | POST | - |  |
| `/alliances` | POST | - |  |
| `/alliances/applications` | GET | 400 | 400 - requires leader/deputy/officer role |
| `/alliances/applications/my` | GET | 200 | `applications` |
| `/alliances/applications/{id}/cancel` | POST | - |  |
| `/alliances/applications/{id}/respond` | POST | - |  |
| `/alliances/chat` | GET | 200 | `messages` |
| `/alliances/chat/alliance-language` | PATCH | - |  |
| `/alliances/chat/my-translation-language` | PATCH | - |  |
| `/alliances/chat/translate` | POST | - |  |
| `/alliances/chat/translation-settings` | GET | 200 | `enabled`, `universeKey`, `provider`, `configured`, `allianceId`, `allianceLanguage`, `myTranslationLanguage`, `canManageAllianceLanguage` |
| `/alliances/chat/{id}` | DELETE | - |  |
| `/alliances/combat-log` | GET | 200 | `entries` |
| `/alliances/diplomacy/relations` | GET | 200 | `relations`, `incoming`, `allyPactState` |
| `/alliances/diplomacy/{id}` | DELETE | - |  |
| `/alliances/diplomacy/{id}/proposal` | DELETE | - |  |
| `/alliances/diplomacy/{id}/respond` | POST | - |  |
| `/alliances/events` | GET | 200 | `entries`, `hasMore`, `nextCursor` |
| `/alliances/extraction-status` | GET | 500 | 500 on the sweep account |
| `/alliances/invites` | GET | 200 | `invites` |
| `/alliances/invites/{id}/respond` | POST | - |  |
| `/alliances/mining-stats` | GET | 200 | `stats`, `totals`, `period`, `scope` |
| `/alliances/search` | GET | 200 | `alliances` |
| `/alliances/station-storage` | GET | 200 | `stations` |
| `/alliances/station-withdraw-members` | PATCH | - |  |
| `/alliances/station-withdraw-roles` | PATCH | - |  |
| `/alliances/territories` | GET | 200 | `territories`, `capturing` |
| `/alliances/{id}` | DELETE/GET/PUT | 200 | `alliance` |
| `/alliances/{id}/apply` | POST | - |  |
| `/alliances/{id}/diplomacy` | POST | - |  |
| `/alliances/{id}/invite` | POST | - |  |
| `/alliances/{id}/kick` | POST | - |  |
| `/alliances/{id}/leave` | POST | - |  |
| `/alliances/{id}/promote` | POST | - |  |
| `/alliances/{id}/transfer-leadership` | POST | - |  |
| `/alliances/{id}/vulnerability-window` | PUT | - |  |
| `/user-diplomacy` | POST | - |  |
| `/user-diplomacy/relations` | GET | 200 | `active`, `incoming` |
| `/user-diplomacy/slots` | GET | 200 | `used`, `max` |
| `/user-diplomacy/{id}` | DELETE | - |  |
| `/user-diplomacy/{id}/respond` | POST | - |  |

## Command Center (403 without CC access)

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/command-center/bookmarks` | GET/POST | 403 | `error`, `code` |
| `/command-center/bookmarks/{id}` | DELETE/PATCH | - |  |
| `/command-center/empire-resources` | GET | 403 | `error`, `code` |
| `/command-center/fleet-overview` | GET | 403 | `error`, `code` |
| `/command-center/fleet-templates/{id}` | DELETE | - |  |
| `/command-center/map-notes` | GET/POST | 403 | `error`, `code` |
| `/command-center/map-notes/{id}` | DELETE/PATCH | - |  |
| `/command-center/research-plan` | GET/POST | 403 | `error`, `code` |
| `/command-center/research-plan/reorder` | PUT | - |  |
| `/command-center/research-plan/{id}` | DELETE | - |  |
| `/command-center/stats` | GET | 403 | `error`, `code` |
| `/command-center/status` | GET | 200 | `active`, `expiresAt`, `traderUsesThisMonth` |
| `/command-center/trader` | GET | 403 | `error`, `code` |
| `/command-center/trader/exchange` | POST | - |  |

## Directives

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/advisor/seen/genesis_welcome_seen` | GET/POST | 200 | `seen` |
| `/directives/{id}/advance` | POST | - |  |
| `/directives/{id}/dismiss-report` | POST | - |  |

## Fleet

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/fleet/alliance-pirate-raids` | GET | 200 | `raids` |
| `/fleet/attack-outpost` | POST | - |  |
| `/fleet/attack-pirates` | POST | - |  |
| `/fleet/beacons` | GET | 200 | `beacons` |
| `/fleet/beacons/{id}/collect` | POST | - |  |
| `/fleet/bounties` | GET | 200 | `bounties` |
| `/fleet/bounties/{id}/claim` | POST | - |  |
| `/fleet/bounties/{id}/reroll` | POST | - |  |
| `/fleet/camp-scout-reports/{id}/read` | POST | - |  |
| `/fleet/clear-survey-guards` | POST | - |  |
| `/fleet/colonization-reports/{id}/read` | POST | - |  |
| `/fleet/combined-assaults` | GET | 200 | `assaults` |
| `/fleet/combined-assaults/{id}/sources` | GET | - |  |
| `/fleet/covert-mining` | POST | - |  |
| `/fleet/cyber-attack` | POST | - |  |
| `/fleet/cyber-reports/{id}/read` | POST | - |  |
| `/fleet/evacuation-rules` | GET/POST | 200 | `rules`, `allowedActions` |
| `/fleet/evacuation-rules/{id}` | DELETE/PUT | - |  |
| `/fleet/expedition-reports/{id}/read` | POST | - |  |
| `/fleet/explore` | POST | - |  |
| `/fleet/field-attack` | POST | - |  |
| `/fleet/field-scan` | POST | - |  |
| `/fleet/field-scan-reports/{id}/read` | POST | - |  |
| `/fleet/garrison/{id}/refuel` | POST | - |  |
| `/fleet/market-deliver` | POST | - |  |
| `/fleet/market-docked-return` | POST | - |  |
| `/fleet/market-pickup` | POST | - |  |
| `/fleet/mine-clear` | POST | - |  |
| `/fleet/mine-deploy` | POST | - |  |
| `/fleet/mine-reports/{id}` | GET | 200 | `report` |
| `/fleet/mine-reports/{id}/read` | POST | - |  |
| `/fleet/mine-scan` | POST | - |  |
| `/fleet/mine-sweep` | POST | - |  |
| `/fleet/minefields` | GET | 200 | `minefields`, `enemyMinefields` |
| `/fleet/mines/collect` | POST | - |  |
| `/fleet/mines/destroy` | POST | - |  |
| `/fleet/mining-fleet-operation-estimate` | POST | - |  |
| `/fleet/mining-fleet-operation-sources` | GET | 200 | `sources` |
| `/fleet/mining-reports/{id}/read` | POST | - |  |
| `/fleet/missions/{id}/partial-recall` | POST | - |  |
| `/fleet/missions/{id}/recall` | POST | - |  |
| `/fleet/moon-dispatch` | POST | - |  |
| `/fleet/patrol` | POST | - |  |
| `/fleet/patrol/bands` | POST | - |  |
| `/fleet/patrol/capacity` | GET | 200 | `total`, `used` |
| `/fleet/patrol/fuel-estimate` | POST | - |  |
| `/fleet/pirate-reports/{id}/read` | POST | - |  |
| `/fleet/report-deletions` | POST | - |  |
| `/fleet/report-saves` | POST | - |  |
| `/fleet/report-unread-summary` | GET | 200 | `counts`, `total` |
| `/fleet/reports/read-all` | POST | - |  |
| `/fleet/reports/{id}/read` | POST | - |  |
| `/fleet/spy` | POST | - |  |
| `/fleet/spy-outpost` | POST | - |  |
| `/fleet/spy-reports/{id}/read` | POST | - |  |
| `/fleet/spy-station` | POST | - |  |
| `/fleet/stealth-deploy` | POST | - |  |
| `/fleet/survey-reports/{id}/read` | POST | - |  |
| `/fleet/system-debris/{id}/hide` | POST | - |  |
| `/fleet/target-info/{id}` | GET | 200 | `id`, `name`, `planetType`, `ownerUserId`, `ownerName`, `ownerRace`, `shieldReinforcedUntil`, `ownerIsVacationMode`, `systemName` |
| `/fleet/wormhole-run` | POST | - |  |
| `/fleet/wormhole-runs/{id}/continue` | POST | - |  |
| `/fleet/wormhole-runs/{id}/quest-choice` | POST | - |  |
| `/fleet/wormhole-runs/{id}/read` | POST | - |  |
| `/fleet/wormhole-runs/{id}/retreat` | POST | - |  |
| `/fleet/zone/{id}` | GET | 200 | `zone`, `sectorId` |

## Galaxy

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/galaxy/alliance-systems` | GET | 200 | `systems` |
| `/galaxy/colonize` | POST | - |  |
| `/galaxy/rift-sectors` | GET | 200 | `array[90]` |
| `/galaxy/search` | GET | 200 | `results`, `systemResults` |
| `/galaxy/station-index` | GET | 200 | `stations` |

## Logistics

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/logistics/routes/{id}` | DELETE/PATCH | - |  |

## Market

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/market/artifacts/{id}/buy` | POST | - |  |
| `/market/artifacts/{id}/cancel` | POST | - |  |
| `/market/cosmetics` | GET | 200 | `creditBalance`, `inventory`, `listings`, `lobbyUserId` |
| `/market/cosmetics/{id}/activate` | POST | - |  |
| `/market/cosmetics/{id}/buy` | POST | - |  |
| `/market/cosmetics/{id}/cancel` | POST | - |  |
| `/market/cosmetics/{id}/list` | POST | - |  |
| `/market/hub-artifacts` | GET | 200 | `artifacts` |
| `/market/hub-docked-fleets` | GET | 200 | `fleets`, `cargoBonus`, `shuttleCargoBonus` |
| `/market/immediate-orders` | POST | - |  |
| `/market/limit-orders` | POST | - |  |
| `/market/my-artifact-listings` | GET | 200 | `listings` |
| `/market/order-book` | GET | 400 | 200 with `hubId`,`baseResource`,`quoteResource`,`depth` |
| `/market/orders/{id}/cancel` | POST | - |  |
| `/market/storage` | GET | 200 | `storage` |

## Messaging

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/messages/alliance-announcement` | POST | - |  |
| `/messages/block/{id}` | DELETE/POST | - |  |
| `/messages/blocks` | GET | 200 | `blocked` |
| `/messages/bug-report` | POST | - |  |
| `/messages/conversations` | GET | 200 | `conversations` |
| `/messages/conversations/find` | GET | 400 | 400 `Username required` (needs a username query param) |
| `/messages/conversations/{id}` | DELETE | - |  |
| `/messages/conversations/{id}/read` | POST | - |  |
| `/messages/send` | POST | - |  |
| `/messages/system/read` | POST | - |  |
| `/messages/system/{id}` | DELETE | - |  |
| `/messages/system/{id}/read` | POST | - |  |
| `/messages/unread-count` | GET | 200 | `count`, `systemCount`, `playerCount` |
| `/reports/admin` | GET | 404 | (empty object) |
| `/reports/admin/users/{id}/pm-mute` | DELETE/POST | - |  |
| `/reports/admin/{id}` | PATCH | - |  |
| `/reports/player` | POST | - |  |

## Moon

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/moons/colonize` | POST | - |  |
| `/moons/owned` | GET | 200 | `moons` |
| `/moons/{id}/abandon` | POST | - |  |
| `/moons/{id}/buildings/{id}/cancel` | POST | - |  |
| `/moons/{id}/buildings/{id}/demolish` | POST | - |  |
| `/moons/{id}/buildings/{id}/power` | POST | - |  |
| `/moons/{id}/buildings/{id}/upgrade` | POST | - |  |
| `/moons/{id}/dispatch-estimate` | POST | - |  |
| `/moons/{id}/hangar-assignments` | PUT | - |  |
| `/moons/{id}/jump-cargo-estimate` | POST | - |  |
| `/moons/{id}/jump-targets` | GET | 200 | `targets` |
| `/moons/{id}/missions` | GET | 200 | `missions` |
| `/moons/{id}/scan/activity` | POST | - |  |
| `/moons/{id}/scan/fleet` | POST | - |  |
| `/moons/{id}/scan/reports` | DELETE/GET | 200 | `array[0]` |
| `/moons/{id}/scan/reports/{id}` | DELETE | - |  |
| `/moons/{id}/scan/sectors` | GET | 400 | 400 `No Sensor Array built on this moon` (needs `type=wormhole|activity` + a Sensor Array) |
| `/moons/{id}/scan/spy-sweep` | POST | - |  |
| `/moons/{id}/scan/targets` | GET | 400 | 400 `No Sensor Array built on this moon` (needs `q=` + a Sensor Array) |
| `/moons/{id}/scan/wormhole` | POST | - |  |
| `/moons/{id}/send-estimate` | POST | - |  |
| `/moons/{id}/shipyard` | GET | 200 | `ships`, `fleet`, `dockyardLevel`, `dockyardPowerLevel`, `repairMode`, `moonResources`, `activeQueue`, `queueAll`, `queueCount`, `maxQueueSize` |
| `/moons/{id}/shipyard/build` | POST | - |  |
| `/moons/{id}/shipyard/cancel/{id}` | POST | - |  |
| `/moons/{id}/shipyard/repair` | POST | - |  |
| `/moons/{id}/shipyard/scrap` | POST | - |  |

## Other

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/announcements` | GET | 404 | (empty object) |
| `/changelog` | GET | 404 | (empty object) |
| `/global-stats` | GET | 404 | (empty object) |
| `/research{id}` | GET | 200 | `research`, `researchSpeedMult`, `precursorFragmentEffectBonus`, `precursorFragmentEffectMultiplierBonus`, `activeResearch`, `activeResearches` |

## Outpost

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/outposts/build` | POST | - |  |
| `/outposts/defend` | POST | - |  |
| `/outposts/{id}/buildings/{id}` | POST | - |  |
| `/outposts/{id}/field-repair` | POST | - |  |
| `/outposts/{id}/hangar-assignments` | PUT | - |  |
| `/outposts/{id}/maintenance-repair` | POST | - |  |
| `/outposts/{id}/mining-cargo-preview` | GET | 200 | `baseCargoBonus`, `attachedCargoBonus`, `attachedCargoFlatBonus` |
| `/outposts/{id}/name` | PATCH | - |  |
| `/outposts/{id}/recall-garrison` | POST | - |  |
| `/outposts/{id}/relocate` | POST | - |  |
| `/outposts/{id}/relocate/estimate` | POST | - |  |
| `/outposts/{id}/upgrade` | POST | - |  |

## Planet

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/buildings/planets/{id}/buildings/{id}/cancel` | POST | - |  |
| `/buildings/planets/{id}/buildings/{id}/demolish` | POST | - |  |
| `/buildings/planets/{id}/buildings/{id}/power` | POST | - |  |
| `/buildings/planets/{id}/buildings/{id}/repair` | POST | - |  |
| `/buildings/planets/{id}/buildings/{id}/upgrade` | POST | - |  |
| `/buildings/planets/{id}/buildings/{id}/workers` | POST | - |  |
| `/planets/dead-space-shield` | GET/PUT | 200 | `enabled`, `durationMinutes`, `activationDelayHours`, `changeCooldownDays`, `activeStartMinuteUtc`, `pendingStartMinuteUtc`, `pendingEffectiveAt`, `nextChangeAt`, `canChange`, `isProtectedNow`, `suppressedUntil`, `windowStartAt`, `windowEndAt`, `nextWindowStartAt` |
| `/planets/order` | PUT | - |  |
| `/planets/{id}/abandon` | POST | - |  |
| `/planets/{id}/defense-config` | GET/PUT | 200 | `planetId`, `scoutPriorityList`, `carrierFighter`, `carrierBomber`, `carrierShuttle` |
| `/planets/{id}/maintenance-repair` | POST | - |  |
| `/planets/{id}/rename` | PUT | - |  |
| `/planets/{id}/resource-snapshot` | GET | 200 | `resourceSnapshot` |
| `/planets/{id}/shipyard/build` | POST | - |  |
| `/planets/{id}/shipyard/cancel/{id}` | POST | - |  |
| `/planets/{id}/shipyard/repair` | POST | - |  |
| `/planets/{id}/shipyard/scrap` | POST | - |  |
| `/research/{id}/cancel` | POST | - |  |

## Rankings

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/rankings/alliances` | GET | 200 | `leaderboard`, `pagination` |
| `/rankings/me` | GET | 200 | `rank` |

## Rift Seal

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/rift-seal` | GET | 200 | `allianceId`, `unlocked`, `attempt`, `count`, `requiredCount`, `totalSealDurationSec` |
| `/rift-seal/active-attempts` | GET | 200 | `attempts` |
| `/rift-seal/attack` | POST | - |  |
| `/rift-seal/defend` | POST | - |  |
| `/rift-seal/dispatch` | POST | - |  |
| `/rift-seal/recall/{id}` | POST | - |  |

## Station

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/stations/{id}/buildings/{id}` | POST | - |  |
| `/stations/{id}/capture-fleet-selection` | PUT | - |  |
| `/stations/{id}/defense-roster` | PUT | - |  |
| `/stations/{id}/dispatch` | POST | - |  |
| `/stations/{id}/dispatch-estimate` | POST | - |  |
| `/stations/{id}/field-repair` | POST | - |  |
| `/stations/{id}/hangar-assignments` | PUT | - |  |
| `/stations/{id}/recall` | POST | - |  |
| `/stations/{id}/repair-queue` | GET | 200 | `queue` |
| `/stations/{id}/resource-log` | GET | 200 | `logs` |
| `/stations/{id}/send` | POST | - |  |
| `/stations/{id}/withdraw-access` | PATCH | - |  |

## Store / Cosmetics

| Endpoint | Verbs | GET | Shape / note |
|---|---|---|---|
| `/cosmetics/rewards` | GET | 200 | `avatars`, `shipSkins`, `portraitFrames`, `titles` |
| `/cosmetics/rewards/equip` | POST | - |  |
| `/cosmetics/rewards/unequip` | POST | - |  |
| `/store/app-store/verify` | POST | - |  |
| `/store/checkout/{id}` | POST | - |  |
| `/store/equip` | POST | - |  |
| `/store/items` | GET | 503 | `error`, `code` |
| `/store/leader-change/apply` | POST | - |  |
| `/store/my-cosmetics` | GET | 200 | `array[5]` |
| `/store/my-purchases` | GET | 200 | `array[0]` |
| `/store/play-billing/verify` | POST | - |  |
| `/store/purchase/{id}` | POST | - |  |
| `/store/steam/checkout/{id}` | POST | - |  |
| `/store/steam/finalize` | POST | - |  |
| `/store/steam/prices` | GET | 503 | `error`, `code` |
| `/store/trader-summon` | GET | 200 | `usesRemaining`, `commandCenterUsesLeft`, `purchasedUses`, `maxCommandCenterUses`, `rates`, `minimumGive`, `feePercent` |
| `/store/trader-summon/exchange` | POST | - |  |

## Notable

- `/api/combat-simulator/bootstrap` (GET) and `/api/combat-simulator/simulate` (POST) - the
  server exposes the official battle simulator. Worth comparing against the addon's own
  combat model instead of calibrating it by hand. Now documented:
  [combat_simulator_bootstrap.md](../get/combat_simulator_bootstrap.md),
  [combat_simulator_simulate.md](../post/combat_simulator_simulate.md).
- `/api/fleet/mining-fleet-operation-estimate` and `/api/fleet/patrol/fuel-estimate` are
  separate estimate endpoints from `/api/fleet/fuel-estimate`.
- `/api/market/order-book` gives real depth per hub/pair; `/api/market/storage` and
  `/api/market/hub-docked-fleets` cover the hub side the addon currently infers.
- `/api/planets/{id}/resource-snapshot` is a cheap single-planet alternative to a full
  `/api/planets/{id}` fetch, and `/api/command-center/empire-resources` would cover all
  planets in one call if the account had Command Center access.
- `/api/fleet/report-unread-summary` and `/api/messages/unread-count` are cheap polling
  endpoints for change detection instead of re-fetching whole report lists.
- All `*/read`, `report-saves`, `report-deletions` endpoints are POST-only mutations and were
  not probed.

## Not covered here

- The lobby host (`nexuslegacy.space`) serves its own set: `/api/universes`,
  `/api/auth/linked-methods`, `/api/announcements`, `/api/changelog`, `/api/global-stats`,
  `/api/auth/me/export`, `/api/ban-appeal/*`. They 404 on `s0` and need a lobby token.
- POST/PUT/PATCH/DELETE payload shapes. The client bundle carries them too; extracting the
  request bodies is a separate pass.
