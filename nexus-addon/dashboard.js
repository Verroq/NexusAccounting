// Dashboard orchestrator: storage load, status bar, tab switching and
// global controls. Tab rendering lives in tabs/*.js, shared helpers in
// common.js (load order matters — this file comes last).

// ── Storage ────────────────────────────────────────────────────────────────

import { RARE_WEIGHT, RESOURCE_WEIGHTS, activeTab, applyResourceWeights, confirmDialog, dayKey, fuelForMode, getLabelKey, getMode, infoDialog, nsGet, periodLabelFor, renderMarkdown, renderNetCards, selectedUniverse, setActiveTab, setSelectedUniverse, setStore, store } from './common.js';
import { SCOPED_KEYS } from './storage-keys.js';
import { renderBattlesTab, setBattlePage } from './tabs/battles.js';
import { renderDebrisTab } from './tabs/debris.js';
import { renderExpeditionsTab, setExpPage } from './tabs/expeditions.js';
import { renderWormholesTab, setWhPage } from './tabs/wormholes.js';
import { initAsteroidsTab } from './tabs/asteroids.js';
import { renderFleetsTab } from './tabs/fleets.js';
import { initScoutingTab } from './tabs/scouting.js';
import { initXenoTab, renderXenoTab, setXnReportPage } from './tabs/xeno.js';
import { initFinderTab } from './tabs/finder.js';
import { initMarketTab } from './tabs/market.js';
import { renderGlobalTab } from './tabs/global.js';
import { renderMiningTab, setMiningPage } from './tabs/mining.js';
import { renderPiratesTab, setPirateCurrentPage } from './tabs/pirates.js';
import { initSimulatorTab } from './tabs/simulator.js';
import { getEventBreakdownForMode, getResourcesLostForMode, getSeriesForMode, getTotalsForMode, populateEventOptions, renderByEventChart, renderCollected, renderEventsChart, renderLost, renderResourceChart, renderTable, setCurrentPage } from './tabs/surveys.js';
import { renderTechTreeTab } from './tabs/techtree.js';

export async function loadAll() {
  const { selected_universe } = await browser.storage.local.get('selected_universe');
  setSelectedUniverse(selected_universe || 's0');
  const universeSelect = document.getElementById('universe-select');
  if (universeSelect) universeSelect.value = selectedUniverse;

  // SCOPED_KEYS (shared with background.js — see storage-keys.js) covers the
  // namespaced scraped-data keys; everything else here is a plain global
  // setting/cache that isn't scoped to a universe.
  const [scoped, globalKeys] = await Promise.all([
    nsGet(SCOPED_KEYS),
    browser.storage.local.get(['ships', 'records_cap', 'research', 'research_speed_mult', 'active_research', 'resource_weights']),
  ]);
  setStore({ ...scoped, ...globalKeys });

  // A stored 0 means "unlimited"; missing falls back to the default cap.
  document.getElementById('records-cap').value = store.records_cap ?? 5000;
  applyResourceWeights(store.resource_weights);
  populateWeightInputs();
  updateStatus(store.last_scrape, store.last_error);
  renderAll();
  updateStorageFooter();
}

// Archived record counts + rough storage size, shown in the footer.
export async function updateStorageFooter() {
  const el = document.getElementById('storage-footer');
  if (!el) return;
  const nsKey = k => `${selectedUniverse}__${k}`;
  const all = await browser.storage.local.get(null);
  const idx = all[nsKey('archive_index')] || {};
  const reports = (idx.survey?.count || all[nsKey('recent_reports')]?.length || 0) +
    (idx.pirate?.count || all[nsKey('pirate_recent_reports')]?.length || 0) +
    (idx.mining?.count || all[nsKey('mining_recent_reports')]?.length || 0) +
    (idx.exp?.count || all[nsKey('exp_recent_reports')]?.length || 0) +
    (idx.xeno?.count || all[nsKey('xeno_recent_reports')]?.length || 0);
  let bytes = 0;
  try { bytes = JSON.stringify(all).length; } catch { /* ignore */ }
  const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const backup = all.last_backup ? new Date(all.last_backup).toLocaleDateString() : 'never';
  el.textContent = `${reports.toLocaleString()} reports archived · ~${size} stored · last auto-backup: ${backup}`;
}

export function updateStatus(lastScrape, lastError) {
  const el = document.getElementById('status-text');
  el.textContent = '';
  if (lastError) {
    const span = document.createElement('span');
    span.className = 'error';
    span.textContent = `Error: ${lastError}`;
    el.appendChild(span);
  } else if (lastScrape) {
    el.textContent = `Last scrape: ${new Date(lastScrape).toLocaleString()}`;
  } else {
    el.textContent = 'Never scraped.';
  }
  if (store.stats_drift) {
    const warn = document.createElement('span');
    warn.className = 'error';
    warn.style.marginLeft = '10px';
    warn.title = `Fields out of sync: ${(store.stats_drift.fields || []).join(', ')}`;
    warn.textContent = '⚠ Stats drift detected — click "Rebuild stats".';
    el.appendChild(warn);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

export function renderAll() {
  if (activeTab === 'global') {
    renderGlobalTab();
    return;
  }
  if (activeTab === 'pirates') {
    renderPiratesTab();
    return;
  }
  if (activeTab === 'mining') {
    renderMiningTab();
    return;
  }
  if (activeTab === 'battles') {
    renderBattlesTab();
    return;
  }
  if (activeTab === 'debris') {
    renderDebrisTab();
    return;
  }
  if (activeTab === 'expeditions') {
    renderExpeditionsTab();
    return;
  }
  if (activeTab === 'wormholes') {
    renderWormholesTab();
    return;
  }
  if (activeTab === 'finder') {
    initFinderTab();
    return;
  }
  if (activeTab === 'asteroids') {
    initAsteroidsTab();
    return;
  }
  if (activeTab === 'fleets') {
    renderFleetsTab();
    return;
  }
  if (activeTab === 'scouting') {
    initScoutingTab();
    return;
  }
  if (activeTab === 'xeno') {
    initXenoTab();
    renderXenoTab();
    return;
  }
  if (activeTab === 'market') {
    initMarketTab();
    return;
  }
  if (activeTab === 'techtree') {
    renderTechTreeTab();
    return;
  }
  if (activeTab === 'simulator') {
    initSimulatorTab();
    return;
  }
  populateEventOptions();
  const mode = getMode();
  const t = getTotalsForMode();
  const rl = getResourcesLostForMode();
  const events = getEventBreakdownForMode();
  const series = getSeriesForMode();
  const labelKey = getLabelKey(mode);
  const periodLabel = periodLabelFor(mode);

  renderCollected(t, periodLabel);
  renderLost(rl, periodLabel);
  renderNetCards('stats-net', t, rl, periodLabel, fuelForMode('survey', getMode()));
  renderResourceChart(series, labelKey);
  renderEventsChart(events);
  renderByEventChart(events);
  renderTable();
}

// ── Tabs ───────────────────────────────────────────────────────────────────

export const TAB_CONTENT = {
  global: 'global-content',
  surveys: 'main-content',
  pirates: 'pirates-content',
  mining: 'mining-content',
  battles: 'battles-content',
  debris: 'debris-content',
  expeditions: 'expeditions-content',
  wormholes: 'wormholes-content',
  finder: 'finder-content',
  asteroids: 'asteroids-content',
  fleets: 'fleets-content',
  scouting: 'scouting-content',
  xeno: 'xeno-content',
  market: 'market-content',
  techtree: 'techtree-content',
  simulator: 'simulator-content',
};

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    for (const [tab, id] of Object.entries(TAB_CONTENT)) {
      document.getElementById(id).style.display = tab === activeTab ? '' : 'none';
    }
    // View mode and records cap are meaningless on the finder and debris tabs.
    document.getElementById('global-controls').style.display =
      (activeTab === 'finder' || activeTab === 'asteroids' || activeTab === 'fleets' || activeTab === 'scouting' || activeTab === 'techtree' || activeTab === 'market' || activeTab === 'simulator') ? 'none' : '';
    positionControls();
    renderAll();
  });
});

// Open directly on a tab when linked with a hash, e.g. dashboard.html#asteroids
// (used by the live-search results window).
if (location.hash) {
  document.querySelector(`.tab[data-tab="${location.hash.slice(1)}"]`)?.click();
}

// Keep the View/Window/Zone bar directly above the active tab's graphs.
export function positionControls() {
  const bar = document.getElementById('global-controls');
  const content = document.getElementById(TAB_CONTENT[activeTab]);
  const charts = content && content.querySelector('.charts');
  if (charts) charts.parentNode.insertBefore(bar, charts);
}

// ── Controls ───────────────────────────────────────────────────────────────

// Which universe's stored data to VIEW. Independent of which universe the
// background scraper is actively scraping (that follows the live game
// session — see background.js's currentUniverse). Switching this only
// changes what loadAll() reads; it does not trigger a scrape.
document.getElementById('universe-select')?.addEventListener('change', async function () {
  await browser.storage.local.set({ selected_universe: this.value });
  await loadAll();
});

document.getElementById('btn-scrape').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = 'Scraping…';
  try {
    await browser.runtime.sendMessage({ type: 'SCRAPE_NOW' });
    await loadAll();
    this.textContent = 'Done ✓';
  } catch {
    this.textContent = 'Error';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = 'Scrape Now'; }, 2000);
  }
});

export function onViewChange() {
  setCurrentPage(1);
  setPirateCurrentPage(1);
  setMiningPage(1);
  setExpPage(1);
  setWhPage(1);
  setXnReportPage(1);
  setBattlePage(1);
  renderAll();
}

// Switching View fills the Days picker: All time clears it (= all history),
// Daily/Hourly = today, Last N = a trailing range. The user can still edit it.
document.getElementById('mode-select').addEventListener('change', () => {
  const mode = getMode();
  const from = document.getElementById('window-from');
  const to = document.getElementById('window-to');
  const span = { last3: 3, last7: 7, last30: 30 }[mode];
  if (mode === 'all') {
    from.value = ''; to.value = '';
  } else {
    const now = Date.now();
    to.value = dayKey(now);
    from.value = dayKey(now - ((span || 1) - 1) * 86400000);
  }
  onViewChange();
});
document.getElementById('zone-select').addEventListener('change', onViewChange);
document.getElementById('window-from').addEventListener('change', onViewChange);
document.getElementById('window-to').addEventListener('change', onViewChange);
document.getElementById('event-select').addEventListener('change', () => { setCurrentPage(1); renderAll(); });

document.getElementById('btn-reset').addEventListener('click', async function () {
  if (!confirm('Drop all recorded data? A backup is written to Downloads/NexusAccounting first.')) return;
  await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'pre-reset' });
  const { records_cap } = await browser.storage.local.get('records_cap');
  await browser.storage.local.clear();
  // Preserve the cap across reset, including 0 ("unlimited").
  if (records_cap != null) await browser.storage.local.set({ records_cap });
  await loadAll();
});

document.getElementById('records-cap').addEventListener('input', function () {
  const raw = this.value.trim();
  const n = parseInt(raw, 10);
  const invalid = raw === '' || isNaN(n) || n < 0 || String(n) !== raw;
  this.style.borderColor = invalid ? '#ff7b72' : '#30363d';
  this.style.color = invalid ? '#ff7b72' : '#e6edf3';
  document.getElementById('cap-warning').style.display = invalid ? '' : 'none';
});

document.getElementById('btn-save-cap').addEventListener('click', async function () {
  const input = document.getElementById('records-cap');
  const raw = parseInt(input.value.trim(), 10);
  if (isNaN(raw) || raw < 0) return;
  // Store 0 verbatim as the "unlimited" sentinel — JSON storage cannot persist
  // Infinity (it round-trips to null), which is what caused 0 to fall back to
  // the default cap. background.js treats a stored 0 as unlimited.
  await browser.storage.local.set({ records_cap: raw });
  input.value = raw;
  input.style.borderColor = '#30363d';
  input.style.color = '#e6edf3';
  document.getElementById('cap-warning').style.display = 'none';
  this.textContent = 'Saved ✓';
  setTimeout(() => { this.textContent = 'Save'; }, 1500);
});

// ── Total-net weights ────────────────────────────────────────────────────

function populateWeightInputs() {
  for (const key of Object.keys(RESOURCE_WEIGHTS)) {
    const el = document.getElementById(`w-${key}`);
    if (el) el.value = RESOURCE_WEIGHTS[key];
  }
  document.getElementById('w-rare').value = RARE_WEIGHT;
}

document.getElementById('btn-save-weights').addEventListener('click', async function () {
  const weights = {};
  for (const key of [...Object.keys(RESOURCE_WEIGHTS), 'rare']) {
    weights[key] = parseFloat(document.getElementById(`w-${key}`).value);
  }
  applyResourceWeights(weights);
  populateWeightInputs();   // reflect back any values applyResourceWeights rejected (NaN/negative)
  // Persist the corrected live values, not the raw (possibly-rejected) input —
  // an invalid field must fall back to its old weight on reload, not silently
  // become 0 (parseFloat('') → NaN → JSON null → Number(null) is 0, which
  // applyResourceWeights would accept as a real weight).
  await browser.storage.local.set({ resource_weights: { ...RESOURCE_WEIGHTS, rare: RARE_WEIGHT } });
  renderAll();
  this.textContent = 'Saved ✓';
  setTimeout(() => { this.textContent = 'Save'; }, 1500);
});

// ── Rebuild aggregates ─────────────────────────────────────────────────────

document.getElementById('btn-rebuild').addEventListener('click', async function () {
  // Display-only count for the confirm dialog, scoped to the universe currently
  // selected for viewing. Note: REBUILD_AGGREGATES itself runs in background.js
  // against ITS currentUniverse (the live game session), which may differ from
  // the universe selected here — see the multi-universe branch notes.
  const s = await nsGet([
    'archive_index',
    'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports', 'xeno_recent_reports',
  ]);
  const idx = s.archive_index || {};
  const n = (idx.survey?.count || (s.recent_reports || []).length) +
            (idx.pirate?.count || (s.pirate_recent_reports || []).length) +
            (idx.mining?.count || (s.mining_recent_reports || []).length) +
            (idx.exp?.count || (s.exp_recent_reports || []).length) +
            (idx.xeno?.count || (s.xeno_recent_reports || []).length);
  if (!confirm(
    `Recompute all aggregated stats from the ${n} archived report records?\n\n` +
    'Mining alloys/rares, stolen-cargo breakdown and mining loss valuation ' +
    'cannot be reconstructed and will reset.')) return;

  this.disabled = true;
  this.textContent = 'Rebuilding…';
  try {
    await browser.runtime.sendMessage({ type: 'REBUILD_AGGREGATES' });
    await loadAll();
    this.textContent = 'Rebuilt ✓';
  } catch {
    this.textContent = 'Error';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = 'Rebuild stats'; }, 2000);
  }
});

// ── Export / Import ────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async function () {
  const data = await browser.storage.local.get(null);
  // records_cap is already stored as a plain number (0 = unlimited).
  const payload = {
    nexus_accounting_backup: 1,
    exported_at: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-accounting-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  this.textContent = 'Exported ✓';
  setTimeout(() => { this.textContent = 'Export JSON'; }, 2000);
});

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

// Shape checks on a backup before anything is cleared. Catches truncated or
// hand-edited files; unknown keys are allowed through untouched.
export function validateBackupData(data) {
  const arrays = [
    'recent_reports', 'daily', 'hourly', 'event_breakdown', 'seen_ids',
    'pirate_recent_reports', 'pirate_seen_ids', 'pirate_daily', 'pirate_outcomes',
    'mining_recent_reports', 'mining_seen_ids', 'mining_daily',
    'exp_recent_reports', 'exp_seen_ids', 'exp_daily',
    'xeno_recent_reports', 'xeno_seen_ids', 'xeno_daily',
    'survey_archive', 'pirate_archive', 'mining_archive', 'exp_archive', 'xeno_archive',
    'spy_reports', 'camp_scout_reports', 'debris_fields',
  ];
  const objects = [
    'totals', 'pirate_totals', 'mining_totals', 'exp_totals', 'xeno_totals',
    'expedition_totals', 'wormhole_totals', 'ships',
    'resources_lost', 'pirate_resources_lost', 'mining_resources_lost',
    'expedition_resources_lost', 'wormhole_resources_lost', 'xeno_resources_lost',
    'pirate_debris_total', 'archive_index',
  ];
  for (const k of arrays) {
    if (k in data && !Array.isArray(data[k])) throw new Error(`backup field "${k}" should be a list`);
  }
  for (const k of objects) {
    if (k in data && (typeof data[k] !== 'object' || data[k] === null || Array.isArray(data[k]))) {
      throw new Error(`backup field "${k}" should be an object`);
    }
  }
  if ('records_cap' in data && typeof data.records_cap !== 'number') {
    throw new Error('backup field "records_cap" should be a number');
  }
}

document.getElementById('import-file').addEventListener('change', async function () {
  const file = this.files[0];
  this.value = '';                    // allow re-selecting the same file
  if (!file) return;

  const btn = document.getElementById('btn-import');
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || payload.nexus_accounting_backup !== 1 || !payload.data || Array.isArray(payload.data) || typeof payload.data !== 'object') {
      throw new Error('not a Nexus Accounting backup file');
    }
    validateBackupData(payload.data);
    const exportedAt = payload.exported_at ? new Date(payload.exported_at).toLocaleString() : 'unknown date';
    if (!confirm(`Replace ALL current data with backup from ${exportedAt}?\n\nA snapshot of the current data is written to Downloads/NexusAccounting first.`)) return;

    await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'pre-import' });
    const data = payload.data;
    // records_cap is stored verbatim (0 = unlimited); no Infinity conversion.
    await browser.storage.local.clear();
    await browser.storage.local.set(data);
    await loadAll();
    btn.textContent = 'Imported ✓';
  } catch (e) {
    alert(`Import failed: ${e.message}`);
    btn.textContent = 'Error';
  } finally {
    setTimeout(() => { btn.textContent = 'Import JSON'; }, 2000);
  }
});

// ── Init ───────────────────────────────────────────────────────────────────

// On launch, if the stored report count is very large, offer a one-click purge
// down to the last 3 days. Runs once (not on every scrape-driven reload).
const PURGE_WARN_THRESHOLD = 10000;
async function maybeWarnStorage() {
  const all = await nsGet([
    'archive_index', 'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports', 'xeno_recent_reports',
  ]);
  const idx = all.archive_index || {};
  const total = (idx.survey?.count || all.recent_reports?.length || 0) +
    (idx.pirate?.count || all.pirate_recent_reports?.length || 0) +
    (idx.mining?.count || all.mining_recent_reports?.length || 0) +
    (idx.exp?.count || all.exp_recent_reports?.length || 0) +
    (idx.xeno?.count || all.xeno_recent_reports?.length || 0);
  if (total <= PURGE_WARN_THRESHOLD) return;
  if (!await confirmDialog(`⚠ Large storage: ${total.toLocaleString()} reports kept.\n\n` +
    'Purge old data and keep only the last 3 days?')) return;
  await browser.runtime.sendMessage({ type: 'PURGE_OLD', days: 3 });
  await loadAll();
}

positionControls();
loadAll().then(maybeWarnStorage);
maybeShowWhatsNew();

// Show the latest changelog section once after an update (flag set by the
// background's onInstalled handler).
async function maybeShowWhatsNew() {
  const { whatsnew_pending } = await browser.storage.local.get('whatsnew_pending');
  if (!whatsnew_pending) return;
  await browser.storage.local.remove('whatsnew_pending');
  let body = 'See CHANGELOG.md for details.';
  try {
    const md = await (await fetch(browser.runtime.getURL('CHANGELOG.md'))).text();
    const m = md.match(/## \[[^\]]+\][^\n]*\n([\s\S]*?)(?=\n## \[|$)/);
    if (m) body = renderMarkdown(m[1].trim());
  } catch { /* keep fallback */ }
  infoDialog(`What's new in v${whatsnew_pending}`, body);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const p = `${selectedUniverse}__`;
  if (changes[`${p}last_scrape`] || changes[`${p}totals`] || changes[`${p}pirate_totals`]) loadAll();
});
