// Dashboard orchestrator: storage load, status bar, tab switching and
// global controls. Tab rendering lives in tabs/*.js, shared helpers in
// common.js (load order matters — this file comes last).

// ── Storage ────────────────────────────────────────────────────────────────

async function loadAll() {
  store = await browser.storage.local.get([
    'totals', 'daily', 'hourly', 'resources_lost', 'event_breakdown',
    'recent_reports', 'ships', 'last_scrape', 'last_error', 'records_cap',
    'pirate_totals', 'pirate_daily', 'pirate_resources_lost',
    'pirate_outcomes', 'pirate_debris_total', 'pirate_recent_reports',
    'mining_totals', 'mining_daily', 'mining_resources_lost', 'mining_recent_reports',
    'debris_fields', 'debris_last_check',
    'debris_collected', 'debris_active_runs', 'debris_collection_log', 'debris_resources_lost',
    'exp_totals', 'exp_daily', 'exp_recent_reports', 'exp_resources_lost', 'stats_drift',
    'research',
  ]);

  const cap = store.records_cap ?? 500;
  document.getElementById('records-cap').value = cap === Infinity ? 0 : cap;
  updateStatus(store.last_scrape, store.last_error);
  renderAll();
  updateStorageFooter();
}

// Archived record counts + rough storage size, shown in the footer.
async function updateStorageFooter() {
  const el = document.getElementById('storage-footer');
  if (!el) return;
  const all = await browser.storage.local.get(null);
  const idx = all.archive_index || {};
  const reports = (idx.survey?.count || all.recent_reports?.length || 0) +
    (idx.pirate?.count || all.pirate_recent_reports?.length || 0) +
    (idx.mining?.count || all.mining_recent_reports?.length || 0) +
    (idx.exp?.count || all.exp_recent_reports?.length || 0);
  let bytes = 0;
  try { bytes = JSON.stringify(all).length; } catch { /* ignore */ }
  const size = bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const backup = all.last_backup ? new Date(all.last_backup).toLocaleDateString() : 'never';
  el.textContent = `${reports.toLocaleString()} reports archived · ~${size} stored · last auto-backup: ${backup}`;
}

function updateStatus(lastScrape, lastError) {
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

function renderAll() {
  if (activeTab === 'pirates') {
    renderPiratesTab();
    return;
  }
  if (activeTab === 'mining') {
    renderMiningTab();
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
  if (activeTab === 'finder') {
    initFinderTab();
    return;
  }
  if (activeTab === 'techtree') {
    renderTechTreeTab();
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
  renderNetCards('stats-net', t, rl, periodLabel);
  renderResourceChart(series, labelKey);
  renderEventsChart(events);
  renderByEventChart(events);
  renderTable();
}

// ── Tabs ───────────────────────────────────────────────────────────────────

const TAB_CONTENT = {
  surveys: 'main-content',
  pirates: 'pirates-content',
  mining: 'mining-content',
  debris: 'debris-content',
  expeditions: 'expeditions-content',
  finder: 'finder-content',
  techtree: 'techtree-content',
};

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    for (const [tab, id] of Object.entries(TAB_CONTENT)) {
      document.getElementById(id).style.display = tab === activeTab ? '' : 'none';
    }
    // View mode and records cap are meaningless on the finder and debris tabs.
    document.querySelector('.controls').style.display =
      (activeTab === 'finder' || activeTab === 'debris' || activeTab === 'techtree') ? 'none' : '';
    renderAll();
  });
});

// ── Controls ───────────────────────────────────────────────────────────────

document.getElementById('btn-scrape').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = 'Scraping…';
  try {
    await browser.runtime.sendMessage({ type: 'SCRAPE_NOW' });
    await loadAll();
    this.textContent = 'Done ✓';
  } catch (e) {
    this.textContent = 'Error';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = 'Scrape Now'; }, 2000);
  }
});

function onViewChange() {
  currentPage = 1;
  pirateCurrentPage = 1;
  miningPage = 1;
  expPage = 1;
  renderAll();
}

document.getElementById('mode-select').addEventListener('change', onViewChange);
document.getElementById('zone-select').addEventListener('change', onViewChange);
document.getElementById('event-select').addEventListener('change', () => { currentPage = 1; renderAll(); });

document.getElementById('btn-reset').addEventListener('click', async function () {
  if (!confirm('Drop all recorded data? A backup is written to Downloads/NexusAccounting first.')) return;
  await browser.runtime.sendMessage({ type: 'BACKUP_NOW', reason: 'pre-reset' });
  const { records_cap } = await browser.storage.local.get('records_cap');
  await browser.storage.local.clear();
  if (records_cap) await browser.storage.local.set({ records_cap });
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
  const val = raw === 0 ? Infinity : raw;
  await browser.storage.local.set({ records_cap: val });
  input.value = val === Infinity ? 0 : val;
  input.style.borderColor = '#30363d';
  input.style.color = '#e6edf3';
  document.getElementById('cap-warning').style.display = 'none';
  this.textContent = 'Saved ✓';
  setTimeout(() => { this.textContent = 'Save'; }, 1500);
});

// ── Rebuild aggregates ─────────────────────────────────────────────────────

document.getElementById('btn-rebuild').addEventListener('click', async function () {
  const s = await browser.storage.local.get([
    'archive_index',
    'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports',
  ]);
  const idx = s.archive_index || {};
  const n = (idx.survey?.count || (s.recent_reports || []).length) +
            (idx.pirate?.count || (s.pirate_recent_reports || []).length) +
            (idx.mining?.count || (s.mining_recent_reports || []).length) +
            (idx.exp?.count || (s.exp_recent_reports || []).length);
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
  } catch (e) {
    this.textContent = 'Error';
  } finally {
    setTimeout(() => { this.disabled = false; this.textContent = 'Rebuild stats'; }, 2000);
  }
});

// ── Export / Import ────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async function () {
  const data = await browser.storage.local.get(null);
  // JSON cannot represent Infinity (unlimited records cap) — store as 0.
  if (data.records_cap === Infinity) data.records_cap = 0;
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
function validateBackupData(data) {
  const arrays = [
    'recent_reports', 'daily', 'hourly', 'event_breakdown', 'seen_ids',
    'pirate_recent_reports', 'pirate_seen_ids', 'pirate_daily', 'pirate_outcomes',
    'mining_recent_reports', 'mining_seen_ids', 'mining_daily',
    'exp_recent_reports', 'exp_seen_ids', 'exp_daily',
    'survey_archive', 'pirate_archive', 'mining_archive', 'exp_archive',
    'spy_reports', 'camp_scout_reports', 'debris_fields',
  ];
  const objects = [
    'totals', 'pirate_totals', 'mining_totals', 'exp_totals', 'ships',
    'resources_lost', 'pirate_resources_lost', 'mining_resources_lost',
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
    if (data.records_cap === 0) data.records_cap = Infinity;
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

loadAll();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.last_scrape || changes.totals || changes.pirate_totals)) loadAll();
});
