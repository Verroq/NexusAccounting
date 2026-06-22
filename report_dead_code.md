# Dead / Unused Code Report

Generated: 2026-06-22

---

## 1. `GET_STATUS` background handler — no callers

**Files:** `nexus-addon/background.js:53` and `nexus-addon/background.js:1847`

**Severity:** Medium — dead function

```javascript
// background.js:53
if (msg.type === 'GET_STATUS') return getStatus();

// background.js:1847
async function getStatus() { ... } // ~30 lines
```

`getStatus()` is fully implemented and builds a rich status object, but no page in the extension ever sends `{ type: 'GET_STATUS' }`. `dashboard.js` only uses `SCRAPE_NOW`, `BACKUP_NOW`, and `REBUILD_AGGREGATES`. Both the handler line and the `getStatus()` function body are entirely unreachable at runtime.

**Action:** Delete the handler line at `:53` and the full `getStatus()` function at `:1847`.

---

## 2. Four unused export slots in `loadBackground()` test helper

**File:** `tests/helpers.js:62-65`

**Severity:** Low — test harness clutter

```javascript
const exports = [
  'processSurveyReports', 'processPirateReports', 'processMiningReports',
  'processExpeditionReports', 'processSystemDebris', 'rebuildAggregates',
  'checkDrift', 'ensureSchema', 'appendToArchive', 'loadArchive',
  'buildShipCatalog', 'extractFleet', 'numericResources', 'MIGRATIONS', // ← none of these 4 are used
  'systemFromLocation', 'resolveZone', 'backfillZones', 'processMissions',
];
```

`buildShipCatalog`, `extractFleet`, `numericResources`, and `MIGRATIONS` are exported by `loadBackground()` but never accessed via `bg.*` anywhere in `tests/processors.test.js`. The functions themselves are live inside `background.js`, but the test-harness export slots serve no purpose.

**Action:** Remove the four names from the exports array in `helpers.js`.

---

## 3. Twelve engine exports with no test coverage

**File:** `nexus-addon/engine.js:380-384`

**Severity:** Low — exports present, tests missing

```javascript
module.exports = {
  WEAPON_VS_ARMOR, SHIELD_BURN, RAPID_FIRE, rapidFireShots, normalizeShipKey,
  TECHS, TECH_MAX_LEVEL, computeMods, NO_MODS, PIRATE_TIER,
  DEFENSE_EST, buildDefenseInstance, buildInstances,
  pickTarget, fireVolley, applyPending,          // ← these 12 are never accessed
  simulateOnce, runSimulations, lossesToResources, setShipDefs,
};
```

The following exports are never accessed via `engine.*` in `tests/engine.test.js`:

| Export | Notes |
|---|---|
| `WEAPON_VS_ARMOR` | Core damage table, no direct assertion |
| `SHIELD_BURN` | Plasma/ion shield multipliers, no direct assertion |
| `RAPID_FIRE` | RF table, tested indirectly via `rapidFireShots()` |
| `TECHS` | Tech definitions array |
| `TECH_MAX_LEVEL` | Constant (value: 5) |
| `PIRATE_TIER` | New multiplier table (added 2026-06-22) |
| `DEFENSE_EST` | Turret stat estimates |
| `buildDefenseInstance` | Turret builder, tested indirectly via `runSimulations` |
| `pickTarget` | Targeting function, tested indirectly |
| `fireVolley` | Volley fire, tested indirectly |
| `applyPending` | Damage resolution, tested indirectly |
| `simulateOnce` | Single-run sim, tested indirectly |

The tests exercise all these via the higher-level `runSimulations()` and `simulateOnce()` — the exports exist for potential direct unit testing but no such tests have been written.

**Action:** Either add targeted unit tests for these lower-level functions, or remove them from `module.exports` if direct testing is not planned (they are not used by any other module).

---

## 4. Dead `.tech-label .est` CSS rule

**File:** `nexus-addon/simulator.css:26`

**Severity:** Low — dead CSS

```css
.tech-label .est { color: #e3b341; }
```

The `.est` class is never added to any element in `simulator.html` or dynamically in `buildTechInputs()` in `simulator.js`. Likely a leftover from a design iteration where estimated/approximate values were to be highlighted in amber to distinguish them from exact values.

**Action:** Delete the rule.

---

## 5. Misleading migration v7 comment (stale after coordinate feature)

**File:** `nexus-addon/background.js:1643`

**Severity:** Low — comment rot

```javascript
// v7: fuel is now counted per launched mission into fuel_log. Clear the log
// (early entries mis-tagged "investigate" survey fleets as "other") plus the
// now-unused per-report fuel/coords caches; it rebuilds from new launches.
7: async () => {
  await browser.storage.local.remove([
    'fuel_log', 'fuel_counted_ids', 'mission_origins',
    'system_coords_by_id', 'system_coords_by_name', 'camp_coords', // ← "now-unused" is wrong
    'home_system_id', 'owned_system_ids',
  ]);
},
```

The comment describes `system_coords_by_id` and `system_coords_by_name` as "now-unused per-report fuel/coords caches." However, as of 2026-06-22, `getSystemZones()` actively writes both keys and `getSystemCoords()` reads them as part of the new system coordinate / distance feature in the simulator.

The migration itself is still correct (it performs a valid one-time cleanup during the v6→v7 upgrade, and the keys get repopulated on the next daily galaxy map refresh), but the comment is misleading for anyone reading the migration history.

**Action:** Update the comment to note that the keys were cleared as stale cache and are now re-populated by `getSystemZones()`.

---

## Summary

| # | Location | Description | Severity |
|---|---|---|---|
| 1 | `background.js:53,1847` | `GET_STATUS` handler + `getStatus()` function, no callers | Medium |
| 2 | `helpers.js:62-65` | 4 unused `loadBackground` export slots in test harness | Low |
| 3 | `engine.js:380-384` | 12 exported symbols with no direct test assertions | Low |
| 4 | `simulator.css:26` | `.tech-label .est` rule, class never applied | Low |
| 5 | `background.js:1643` | Comment says coords keys "now-unused" but they are re-used | Low |
