let chartResources, chartEvents, chartByEvent;
let chartPirateLoot, chartPirateOutcomes;
let store = {};   // full storage snapshot
let currentPage = 1;
let pirateCurrentPage = 1;
let activeTab = 'surveys';
const PER_PAGE = 20;

function fmt(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}


// ── Storage ────────────────────────────────────────────────────────────────

async function loadAll() {
  store = await browser.storage.local.get([
    'totals', 'daily', 'hourly', 'resources_lost', 'event_breakdown',
    'recent_reports', 'ships', 'last_scrape', 'last_error', 'records_cap',
    'pirate_totals', 'pirate_daily', 'pirate_resources_lost',
    'pirate_outcomes', 'pirate_debris_total', 'pirate_recent_reports',
    'mining_totals', 'mining_daily', 'mining_resources_lost', 'mining_recent_reports',
    'debris_fields', 'debris_collected_est', 'debris_last_check',
    'exp_totals', 'exp_daily', 'exp_recent_reports', 'stats_drift',
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
  const reports = (all.survey_archive?.length || all.recent_reports?.length || 0) +
    (all.pirate_archive?.length || all.pirate_recent_reports?.length || 0) +
    (all.mining_archive?.length || all.mining_recent_reports?.length || 0) +
    (all.exp_archive?.length || all.exp_recent_reports?.length || 0);
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

// ── Mode-aware data helpers ────────────────────────────────────────────────

function getMode() {
  return document.getElementById('mode-select').value; // 'all' | 'daily' | 'hourly'
}

// Returns the latest bucket key and a filtered report slice for daily/hourly modes.
function getLatestBucketReports(mode) {
  const keyFn = r => mode === 'daily'
    ? r.created_at.slice(0, 10)
    : r.created_at.slice(0, 13) + ':00';
  const reports = store.recent_reports || [];
  if (!reports.length) return [];
  const latestKey = reports.reduce((best, r) => {
    const k = keyFn(r);
    return k > best ? k : best;
  }, '');
  return reports.filter(r => keyFn(r) === latestKey);
}

// Returns {ore, hydrogen, silicates, missions, ships_lost} for the current mode.
function getTotalsForMode() {
  const mode = getMode();
  if (mode === 'all') return store.totals || {};
  const bucket = getLatestBucketReports(mode);
  return bucket.reduce((t, r) => ({
    ore: t.ore + (r.ore || 0),
    hydrogen: t.hydrogen + (r.hydrogen || 0),
    silicates: t.silicates + (r.silicates || 0),
    missions: t.missions + 1,
    ships_lost: t.ships_lost + (r.ships_lost || 0),
  }), { ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 });
}

// Returns resources-lost for the current mode.
function getResourcesLostForMode() {
  const mode = getMode();
  if (mode === 'all') return store.resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  return computeResourcesLost(getLatestBucketReports(mode), store.ships || {});
}

// Returns event_breakdown array for the current mode.
function getEventBreakdownForMode() {
  const mode = getMode();
  if (mode === 'all') return store.event_breakdown || [];
  return computeEventBreakdown(getLatestBucketReports(mode));
}

// Returns time-series data array for the resources-over-time chart.
function getSeriesForMode() {
  const mode = getMode();
  if (mode !== 'hourly') return store.daily || [];

  // Always compute hourly from recent_reports so it works even when
  // background hasn't had a chance to rebuild the stored hourly array.
  const hourlyMap = {};
  for (const r of (store.recent_reports || [])) {
    const hour = r.created_at.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 };
    hourlyMap[hour].ore += r.ore || 0;
    hourlyMap[hour].hydrogen += r.hydrogen || 0;
    hourlyMap[hour].silicates += r.silicates || 0;
    hourlyMap[hour].missions += 1;
    hourlyMap[hour].ships_lost += r.ships_lost || 0;
  }
  return Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour));
}

function getLabelKey(mode) {
  return mode === 'hourly' ? 'hour' : 'day';
}

// ── Pure aggregation helpers ───────────────────────────────────────────────

function computeEventBreakdown(reports) {
  const map = {};
  for (const r of reports) {
    const et = r.event_type || 'unknown';
    if (!map[et]) map[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[et].count += 1;
    map[et].ore += r.ore || 0;
    map[et].hydrogen += r.hydrogen || 0;
    map[et].silicates += r.silicates || 0;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function computeResourcesLost(reports, ships) {
  const rl = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  for (const r of reports) {
    for (const [defId, qty] of Object.entries(r.ships_lost_detail || {})) {
      const ship = ships[defId];
      if (!ship) continue;
      rl.ore += qty * (ship.costOre || 0);
      rl.silicates += qty * (ship.costSilicates || 0);
      rl.hydrogen += qty * (ship.costHydrogen || 0);
      rl.alloys += qty * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) {
        rl.rare[k] = (rl.rare[k] || 0) + qty * v;
      }
    }
  }
  return rl;
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
  const mode = getMode();
  const t = getTotalsForMode();
  const rl = getResourcesLostForMode();
  const events = getEventBreakdownForMode();
  const series = getSeriesForMode();
  const labelKey = getLabelKey(mode);
  const periodLabel = mode === 'all' ? '' : mode === 'daily' ? ' (latest day)' : ' (latest hour)';

  renderCollected(t, periodLabel);
  renderLost(rl, periodLabel);
  renderResourceChart(series, labelKey);
  renderEventsChart(events);
  renderByEventChart(events);
  renderTable();
}

// ── Stat cards ─────────────────────────────────────────────────────────────

function makeStatCard(label, value, valueClass, valueStyle) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  if (valueStyle) valueDiv.style.cssText = valueStyle;
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

function renderCollected(t, periodLabel) {
  const container = document.getElementById('stats-collected');
  container.textContent = '';
  const noData = !store.totals || !store.totals.missions;
  if (noData) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No data yet — log in to ';
    const a = document.createElement('a');
    a.href = 'https://s0.nexuslegacy.space';
    a.target = '_blank';
    a.style.color = '#58a6ff';
    a.textContent = 'Nexus Legacy';
    p.append(a, document.createTextNode(' then click Scrape Now.'));
    container.appendChild(p);
    return;
  }
  container.append(
    makeStatCard(`Ore${periodLabel}`,        fmt(t.ore),        'ore'),
    makeStatCard(`Silicates${periodLabel}`,  fmt(t.silicates),  'silicates'),
    makeStatCard(`Hydrogen${periodLabel}`,   fmt(t.hydrogen),   'hydrogen'),
    makeStatCard(`Missions${periodLabel}`,   fmt(t.missions),   'missions'),
    makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
  );
}

function renderLost(rl, periodLabel) {
  const container = document.getElementById('stats-lost');
  container.textContent = '';
  container.append(
    makeStatCard(`Ore lost${periodLabel}`,      fmt(rl.ore),      'ore'),
    makeStatCard(`Silicates lost${periodLabel}`, fmt(rl.silicates), 'silicates'),
    makeStatCard(`Hydrogen lost${periodLabel}`,  fmt(rl.hydrogen),  'hydrogen'),
    makeStatCard(`Alloys lost${periodLabel}`,    fmt(rl.alloys),    'alloys'),
  );
  Object.entries(rl.rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => container.appendChild(
      makeStatCard(`${k.replace(/_/g, ' ')}${periodLabel}`, fmt(v), 'rare')
    ));
}

// ── Charts ─────────────────────────────────────────────────────────────────

const SCALE_OPTS = {
  x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
  y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
};

function renderResourceChart(series, labelKey) {
  const labels = series.map(r => r[labelKey]);
  const datasets = [
    { label: 'Ore',       data: series.map(r => r.ore),       borderColor: '#f0883e', backgroundColor: '#f0883e22', fill: true, tension: 0.3 },
    { label: 'Hydrogen',  data: series.map(r => r.hydrogen),  borderColor: '#79c0ff', backgroundColor: '#79c0ff22', fill: true, tension: 0.3 },
    { label: 'Silicates', data: series.map(r => r.silicates), borderColor: '#56d364', backgroundColor: '#56d36422', fill: true, tension: 0.3 },
  ];
  if (chartResources) chartResources.destroy();
  chartResources = new Chart(document.getElementById('chart-resources'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: SCALE_OPTS,
    },
  });
}

function renderEventsChart(events) {
  const total = events.reduce((s, e) => s + e.count, 0);
  const labels = events.map(e => {
    const pct = total ? (e.count / total * 100).toFixed(1) : 0;
    return `${e.event_type.replace(/_/g, ' ')} — ${e.count} (${pct}%)`;
  });
  const colors = ['#58a6ff','#56d364','#f0883e','#79c0ff','#d2a8ff','#ff7b72','#ffa657','#8b949e','#e3b341'];
  if (chartEvents) chartEvents.destroy();
  chartEvents = new Chart(document.getElementById('chart-events'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: events.map(e => e.count), backgroundColor: colors }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${ctx.parsed} missions (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderByEventChart(events) {
  const filtered = events.filter(e => e.ore || e.hydrogen || e.silicates);
  const labels = filtered.map(e => e.event_type.replace(/_/g, ' '));
  if (chartByEvent) chartByEvent.destroy();
  chartByEvent = new Chart(document.getElementById('chart-by-event'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ore',       data: filtered.map(e => e.ore),       backgroundColor: '#f0883ecc' },
        { label: 'Hydrogen',  data: filtered.map(e => e.hydrogen),  backgroundColor: '#79c0ffcc' },
        { label: 'Silicates', data: filtered.map(e => e.silicates), backgroundColor: '#56d364cc' },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: SCALE_OPTS,
    },
  });
}

// ── Reports table ──────────────────────────────────────────────────────────

function renderTable() {
  const allReports = (store.recent_reports || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const totalPages = Math.ceil(allReports.length / PER_PAGE);
  document.getElementById('page-info').textContent = `Page ${currentPage} / ${Math.max(1, totalPages)} (${allReports.length} total)`;
  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;

  const slice = allReports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const tbody = document.getElementById('reports-tbody');
  tbody.textContent = '';

  function zeroTd(v) {
    const td = document.createElement('td');
    if (v) {
      td.textContent = v.toLocaleString();
    } else {
      const span = document.createElement('span');
      span.className = 'zero';
      span.textContent = '—';
      td.appendChild(span);
    }
    return td;
  }

  for (const r of slice) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();

    const tdSys = document.createElement('td');
    tdSys.textContent = r.system_name || '—';

    const tdEvt = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.event_type}`;
    badge.textContent = r.event_type.replace(/_/g, ' ');
    tdEvt.appendChild(badge);

    const tdOre = zeroTd(r.ore);       tdOre.className = 'ore';
    const tdHyd = zeroTd(r.hydrogen);  tdHyd.className = 'hydrogen';
    const tdSil = zeroTd(r.silicates); tdSil.className = 'silicates';

    tr.append(tdDate, tdSys, tdEvt, tdOre, tdHyd, tdSil,
              zeroTd(r.ships_lost), zeroTd(r.ships_damaged), zeroTd(r.wormholes_detected));
    tbody.appendChild(tr);
  }
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
}

document.getElementById('btn-prev').addEventListener('click', () => changePage(-1));
document.getElementById('btn-next').addEventListener('click', () => changePage(1));

// ── Pirates tab ────────────────────────────────────────────────────────────

function getPirateBucketReports(mode) {
  const keyFn = r => mode === 'daily'
    ? r.created_at.slice(0, 10)
    : r.created_at.slice(0, 13) + ':00';
  const reports = store.pirate_recent_reports || [];
  if (!reports.length) return [];
  const latestKey = reports.reduce((best, r) => {
    const k = keyFn(r);
    return k > best ? k : best;
  }, '');
  return reports.filter(r => keyFn(r) === latestKey);
}

function getPirateTotalsForMode() {
  const mode = getMode();
  if (mode === 'all') return store.pirate_totals || {};
  return getPirateBucketReports(mode).reduce((t, r) => ({
    ore: t.ore + (r.ore || 0),
    hydrogen: t.hydrogen + (r.hydrogen || 0),
    silicates: t.silicates + (r.silicates || 0),
    raids: t.raids + 1,
    ships_destroyed: t.ships_destroyed + (r.ships_lost || 0),
    ships_damaged: t.ships_damaged + (r.ships_damaged || 0),
    pirates_destroyed: t.pirates_destroyed + (r.pirates_destroyed || 0),
  }), { ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0, ships_damaged: 0, pirates_destroyed: 0 });
}

function getPirateLostForMode() {
  const mode = getMode();
  if (mode === 'all') return store.pirate_resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  return computeResourcesLost(getPirateBucketReports(mode), store.ships || {});
}

function getPirateDebrisForMode() {
  const mode = getMode();
  if (mode === 'all') return store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  return getPirateBucketReports(mode).reduce((t, r) => ({
    ore: t.ore + (r.debris_ore || 0),
    alloys: t.alloys + (r.debris_alloys || 0),
    silicates: t.silicates + (r.debris_silicates || 0),
  }), { ore: 0, alloys: 0, silicates: 0 });
}

function getPirateOutcomesForMode() {
  const mode = getMode();
  if (mode === 'all') return store.pirate_outcomes || [];
  const map = {};
  for (const r of getPirateBucketReports(mode)) {
    const o = r.outcome || 'unknown';
    if (!map[o]) map[o] = { outcome: o, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[o].count += 1;
    map[o].ore += r.ore || 0;
    map[o].hydrogen += r.hydrogen || 0;
    map[o].silicates += r.silicates || 0;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function getPirateSeriesForMode() {
  const mode = getMode();
  if (mode !== 'hourly') return store.pirate_daily || [];
  const hourlyMap = {};
  for (const r of (store.pirate_recent_reports || [])) {
    const hour = r.created_at.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, hydrogen: 0, silicates: 0, raids: 0 };
    hourlyMap[hour].ore += r.ore || 0;
    hourlyMap[hour].hydrogen += r.hydrogen || 0;
    hourlyMap[hour].silicates += r.silicates || 0;
    hourlyMap[hour].raids += 1;
  }
  return Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour));
}

function renderPiratesTab() {
  const mode = getMode();
  const periodLabel = mode === 'all' ? '' : mode === 'daily' ? ' (latest day)' : ' (latest hour)';
  const t = getPirateTotalsForMode();
  const rl = getPirateLostForMode();
  const debris = getPirateDebrisForMode();
  const outcomes = getPirateOutcomesForMode();
  const series = getPirateSeriesForMode();
  const labelKey = getLabelKey(mode);

  const collected = document.getElementById('p-stats-collected');
  collected.textContent = '';
  if (!store.pirate_totals || !store.pirate_totals.raids) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No pirate raids recorded yet — click Scrape Now after raiding a camp.';
    collected.appendChild(p);
  } else {
    collected.append(
      makeStatCard(`Ore${periodLabel}`,       fmt(t.ore),       'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`,  fmt(t.hydrogen),  'hydrogen'),
      makeStatCard(`Raids${periodLabel}`,     fmt(t.raids),     'missions'),
      makeStatCard(`Ships destroyed${periodLabel}`, fmt(t.ships_destroyed), '', 'color:#ff7b72'),
      makeStatCard(`Pirates destroyed${periodLabel}`, fmt(t.pirates_destroyed), '', 'color:#56d364'),
    );
  }

  const lostEl = document.getElementById('p-stats-lost');
  lostEl.textContent = '';
  lostEl.append(
    makeStatCard(`Ore lost${periodLabel}`,       fmt(rl.ore),       'ore'),
    makeStatCard(`Silicates lost${periodLabel}`, fmt(rl.silicates), 'silicates'),
    makeStatCard(`Hydrogen lost${periodLabel}`,  fmt(rl.hydrogen),  'hydrogen'),
    makeStatCard(`Alloys lost${periodLabel}`,    fmt(rl.alloys),    'alloys'),
  );
  Object.entries(rl.rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => lostEl.appendChild(
      makeStatCard(`${k.replace(/_/g, ' ')}${periodLabel}`, fmt(v), 'rare')
    ));

  const debrisEl = document.getElementById('p-stats-debris');
  debrisEl.textContent = '';
  debrisEl.append(
    makeStatCard(`Debris ore${periodLabel}`,       fmt(debris.ore),       'ore'),
    makeStatCard(`Debris alloys${periodLabel}`,    fmt(debris.alloys),    'alloys'),
    makeStatCard(`Debris silicates${periodLabel}`, fmt(debris.silicates), 'silicates'),
  );

  renderPirateLootChart(series, labelKey);
  renderPirateOutcomesChart(outcomes);
  renderPirateTable();
}

function renderPirateLootChart(series, labelKey) {
  const labels = series.map(r => r[labelKey]);
  const datasets = [
    { label: 'Ore',       data: series.map(r => r.ore),       borderColor: '#f0883e', backgroundColor: '#f0883e22', fill: true, tension: 0.3 },
    { label: 'Hydrogen',  data: series.map(r => r.hydrogen),  borderColor: '#79c0ff', backgroundColor: '#79c0ff22', fill: true, tension: 0.3 },
    { label: 'Silicates', data: series.map(r => r.silicates), borderColor: '#56d364', backgroundColor: '#56d36422', fill: true, tension: 0.3 },
  ];
  if (chartPirateLoot) chartPirateLoot.destroy();
  chartPirateLoot = new Chart(document.getElementById('chart-pirate-loot'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: SCALE_OPTS,
    },
  });
}

function renderPirateOutcomesChart(outcomes) {
  const total = outcomes.reduce((s, o) => s + o.count, 0);
  const labels = outcomes.map(o => {
    const pct = total ? (o.count / total * 100).toFixed(1) : 0;
    return `${o.outcome.replace(/_/g, ' ')} — ${o.count} (${pct}%)`;
  });
  const colors = ['#56d364', '#ff7b72', '#e3b341', '#58a6ff', '#8b949e'];
  if (chartPirateOutcomes) chartPirateOutcomes.destroy();
  chartPirateOutcomes = new Chart(document.getElementById('chart-pirate-outcomes'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: outcomes.map(o => o.count), backgroundColor: colors }] },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${ctx.parsed} raids (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderPirateTable() {
  const allReports = (store.pirate_recent_reports || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const totalPages = Math.ceil(allReports.length / PER_PAGE);
  document.getElementById('p-page-info').textContent = `Page ${pirateCurrentPage} / ${Math.max(1, totalPages)} (${allReports.length} total)`;
  document.getElementById('p-btn-prev').disabled = pirateCurrentPage <= 1;
  document.getElementById('p-btn-next').disabled = pirateCurrentPage >= totalPages;

  const slice = allReports.slice((pirateCurrentPage - 1) * PER_PAGE, pirateCurrentPage * PER_PAGE);
  const tbody = document.getElementById('p-reports-tbody');
  tbody.textContent = '';

  function zeroTd(v) {
    const td = document.createElement('td');
    if (v) {
      td.textContent = v.toLocaleString();
    } else {
      const span = document.createElement('span');
      span.className = 'zero';
      span.textContent = '—';
      td.appendChild(span);
    }
    return td;
  }

  for (const r of slice) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();

    const tdCamp = document.createElement('td');
    tdCamp.textContent = r.camp_id != null ? `#${r.camp_id}` : '—';

    const tdOutcome = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.outcome}`;
    badge.textContent = (r.outcome || 'unknown').replace(/_/g, ' ');
    tdOutcome.appendChild(badge);

    const tdOre = zeroTd(r.ore);       tdOre.className = 'ore';
    const tdHyd = zeroTd(r.hydrogen);  tdHyd.className = 'hydrogen';
    const tdSil = zeroTd(r.silicates); tdSil.className = 'silicates';

    tr.append(tdDate, tdCamp, tdOutcome, tdOre, tdHyd, tdSil,
              zeroTd(r.ships_lost), zeroTd(r.ships_damaged), zeroTd(r.pirates_destroyed));
    tbody.appendChild(tr);
  }
}

function changePiratePage(delta) {
  pirateCurrentPage += delta;
  renderPirateTable();
}

document.getElementById('p-btn-prev').addEventListener('click', () => changePiratePage(-1));
document.getElementById('p-btn-next').addEventListener('click', () => changePiratePage(1));

// ── Shared helpers for the newer tabs ──────────────────────────────────────

function zeroCell(v) {
  const td = document.createElement('td');
  if (v) {
    td.textContent = Number(v).toLocaleString();
  } else {
    const span = document.createElement('span');
    span.className = 'zero';
    span.textContent = '—';
    td.appendChild(span);
  }
  return td;
}

function appendRareCards(container, rare, suffix) {
  Object.entries(rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => container.appendChild(
      makeStatCard(`${k.replace(/_/g, ' ')}${suffix}`, fmt(v), 'rare')
    ));
}

function renderPagedTable(reports, page, infoId, prevId, nextId, tbodyId, rowFn) {
  const totalPages = Math.ceil(reports.length / PER_PAGE);
  const maxPage = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), maxPage);
  document.getElementById(infoId).textContent = `Page ${safePage} / ${maxPage} (${reports.length} total)`;
  document.getElementById(prevId).disabled = safePage <= 1;
  document.getElementById(nextId).disabled = safePage >= totalPages;
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const r of reports.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)) {
    tbody.appendChild(rowFn(r));
  }
}

// ── Mining tab ─────────────────────────────────────────────────────────────

let chartMining;
let miningPage = 1;

// Latest day/hour slice of mining reports for the daily/hourly view modes.
function getMiningBucketReports(mode) {
  const keyFn = r => mode === 'daily'
    ? r.created_at.slice(0, 10)
    : r.created_at.slice(0, 13) + ':00';
  const reports = store.mining_recent_reports || [];
  if (!reports.length) return [];
  const latestKey = reports.reduce((best, r) => {
    const k = keyFn(r);
    return k > best ? k : best;
  }, '');
  return reports.filter(r => keyFn(r) === latestKey);
}

function getMiningTotalsForMode(mode) {
  if (mode === 'all') {
    return store.mining_totals || {
      ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
      deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0,
      stolen: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} },
    };
  }
  return getMiningBucketReports(mode).reduce((t, r) => ({
    ore: t.ore + (r.ore || 0),
    silicates: t.silicates + (r.silicates || 0),
    hydrogen: t.hydrogen + (r.hydrogen || 0),
    deliveries: t.deliveries + 1,
    cycles: t.cycles + (r.cycles || 0),
    drill_breakdowns: t.drill_breakdowns + (r.drill_breakdowns || 0),
    ships_lost: t.ships_lost + (r.ships_lost || 0),
    stolen_total: t.stolen_total + (r.stolen_total || 0),
  }), { ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0, stolen_total: 0 });
}

function getMiningSeriesForMode(mode) {
  if (mode !== 'hourly') return store.mining_daily || [];
  const hourlyMap = {};
  for (const r of (store.mining_recent_reports || [])) {
    const hour = r.created_at.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, silicates: 0, hydrogen: 0 };
    hourlyMap[hour].ore += r.ore || 0;
    hourlyMap[hour].silicates += r.silicates || 0;
    hourlyMap[hour].hydrogen += r.hydrogen || 0;
  }
  return Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour));
}

function renderMiningTab() {
  const mode = getMode();
  const periodLabel = mode === 'all' ? '' : mode === 'daily' ? ' (latest day)' : ' (latest hour)';
  const t = getMiningTotalsForMode(mode);

  const delivered = document.getElementById('m-stats-delivered');
  delivered.textContent = '';
  if (!store.mining_totals || !store.mining_totals.deliveries) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No mining deliveries recorded yet.';
    delivered.appendChild(p);
  } else {
    delivered.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
    );
    // Alloys and rares are only tracked in the all-time totals.
    if (mode === 'all') {
      delivered.appendChild(makeStatCard('Alloys', fmt(t.alloys), 'alloys'));
      appendRareCards(delivered, t.rare, '');
    }
  }

  const ops = document.getElementById('m-stats-ops');
  ops.textContent = '';
  const stolenTotal = mode === 'all'
    ? (t.stolen
        ? (t.stolen.ore + t.stolen.silicates + t.stolen.hydrogen + t.stolen.alloys +
           Object.values(t.stolen.rare || {}).reduce((s, v) => s + v, 0))
        : 0)
    : t.stolen_total;
  ops.append(
    makeStatCard(`Deliveries${periodLabel}`, fmt(t.deliveries), 'missions'),
    makeStatCard(`Mining cycles${periodLabel}`, fmt(t.cycles), ''),
    makeStatCard(`Drill breakdowns${periodLabel}`, fmt(t.drill_breakdowns), '', 'color:#e3b341'),
    makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
    makeStatCard(`Cargo stolen${periodLabel}`, fmt(stolenTotal), '', 'color:#ff7b72'),
  );

  const lostEl = document.getElementById('m-stats-lost');
  lostEl.textContent = '';
  const rl = store.mining_resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  lostEl.append(
    makeStatCard('Ore lost', fmt(rl.ore), 'ore'),
    makeStatCard('Silicates lost', fmt(rl.silicates), 'silicates'),
    makeStatCard('Hydrogen lost', fmt(rl.hydrogen), 'hydrogen'),
    makeStatCard('Alloys lost', fmt(rl.alloys), 'alloys'),
  );
  appendRareCards(lostEl, rl.rare, ' lost');

  const series = getMiningSeriesForMode(mode);
  const labelKey = getLabelKey(mode);
  if (chartMining) chartMining.destroy();
  chartMining = new Chart(document.getElementById('chart-mining'), {
    type: 'line',
    data: {
      labels: series.map(r => r[labelKey]),
      datasets: [
        { label: 'Ore',       data: series.map(r => r.ore),       borderColor: '#f0883e', backgroundColor: '#f0883e22', fill: true, tension: 0.3 },
        { label: 'Silicates', data: series.map(r => r.silicates), borderColor: '#56d364', backgroundColor: '#56d36422', fill: true, tension: 0.3 },
        { label: 'Hydrogen',  data: series.map(r => r.hydrogen),  borderColor: '#79c0ff', backgroundColor: '#79c0ff22', fill: true, tension: 0.3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e6edf3' } } }, scales: SCALE_OPTS },
  });

  renderMiningTable();
}

function renderMiningTable() {
  const reports = (store.mining_recent_reports || []).slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  renderPagedTable(reports, miningPage, 'm-page-info', 'm-btn-prev', 'm-btn-next', 'm-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location;
    const tdOre = zeroCell(r.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(r.silicates); tdSil.className = 'silicates';
    const tdHyd = zeroCell(r.hydrogen); tdHyd.className = 'hydrogen';
    tr.append(tdDate, tdLoc, tdOre, tdSil, tdHyd,
              zeroCell(r.cycles), zeroCell(r.drill_breakdowns),
              zeroCell(r.ships_lost), zeroCell(r.stolen_total));
    return tr;
  });
}

document.getElementById('m-btn-prev').addEventListener('click', () => { miningPage--; renderMiningTable(); });
document.getElementById('m-btn-next').addEventListener('click', () => { miningPage++; renderMiningTable(); });

// ── Debris tab ─────────────────────────────────────────────────────────────

function renderDebrisTab() {
  const gen = store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  const genEl = document.getElementById('d-stats-generated');
  genEl.textContent = '';
  genEl.append(
    makeStatCard('Ore', fmt(gen.ore), 'ore'),
    makeStatCard('Silicates', fmt(gen.silicates), 'silicates'),
    makeStatCard('Alloys', fmt(gen.alloys), 'alloys'),
  );

  const col = store.debris_collected_est || { ore: 0, silicates: 0, alloys: 0, hydrogen: 0 };
  const colEl = document.getElementById('d-stats-collected');
  colEl.textContent = '';
  colEl.append(
    makeStatCard('Ore', fmt(col.ore), 'ore'),
    makeStatCard('Silicates', fmt(col.silicates), 'silicates'),
    makeStatCard('Alloys', fmt(col.alloys), 'alloys'),
    makeStatCard('Hydrogen', fmt(col.hydrogen), 'hydrogen'),
  );

  document.getElementById('d-last-check').textContent = store.debris_last_check
    ? `Last check: ${new Date(store.debris_last_check).toLocaleString()}`
    : 'Not checked yet.';

  const tbody = document.getElementById('d-fields-tbody');
  tbody.textContent = '';
  const fields = (store.debris_fields || []).slice()
    .sort((a, b) => (b.ore + b.silicates + b.alloys) - (a.ore + a.silicates + a.alloys));
  if (!fields.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.color = '#484f58';
    td.textContent = 'No debris fields currently visible.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const f of fields) {
    const tr = document.createElement('tr');
    const tdSys = document.createElement('td');
    tdSys.textContent = f.system;
    const tdOre = zeroCell(f.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(f.silicates); tdSil.className = 'silicates';
    const tdAl = zeroCell(f.alloys); tdAl.className = 'alloys';
    const tdHyd = zeroCell(f.hydrogen); tdHyd.className = 'hydrogen';
    const tdFirst = document.createElement('td');
    tdFirst.textContent = new Date(f.first_seen).toLocaleString();
    const tdUpd = document.createElement('td');
    tdUpd.textContent = new Date(f.updated_at).toLocaleString();
    tr.append(tdSys, tdOre, tdSil, tdAl, tdHyd, tdFirst, tdUpd);
    tbody.appendChild(tr);
  }
}

// ── Expeditions tab ────────────────────────────────────────────────────────

let chartExpeditions;
let expPage = 1;

// Latest day/hour slice of expedition/wormhole reports for the view modes.
function getExpBucketReports(mode) {
  const keyFn = r => mode === 'daily'
    ? r.created_at.slice(0, 10)
    : r.created_at.slice(0, 13) + ':00';
  const reports = store.exp_recent_reports || [];
  if (!reports.length) return [];
  const latestKey = reports.reduce((best, r) => {
    const k = keyFn(r);
    return k > best ? k : best;
  }, '');
  return reports.filter(r => keyFn(r) === latestKey);
}

// Per-report records carry the full loot map, so all resources (rares included)
// work in every view mode.
function getExpTotalsForMode(mode) {
  if (mode === 'all') {
    return store.exp_totals || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  }
  const t = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  for (const r of getExpBucketReports(mode)) {
    for (const [k, v] of Object.entries(r.loot || {})) {
      if (k in t && k !== 'rare' && k !== 'missions' && k !== 'ships_lost') t[k] += v;
      else if (!['ore', 'silicates', 'hydrogen', 'alloys'].includes(k)) t.rare[k] = (t.rare[k] || 0) + v;
    }
    t.missions += 1;
    t.ships_lost += r.ships_lost || 0;
  }
  return t;
}

function getExpSeriesForMode(mode) {
  if (mode !== 'hourly') return store.exp_daily || [];
  const hourlyMap = {};
  for (const r of (store.exp_recent_reports || [])) {
    const hour = r.created_at.slice(0, 13) + ':00';
    if (!hourlyMap[hour]) hourlyMap[hour] = { hour, ore: 0, silicates: 0, hydrogen: 0 };
    hourlyMap[hour].ore += r.loot?.ore || 0;
    hourlyMap[hour].silicates += r.loot?.silicates || 0;
    hourlyMap[hour].hydrogen += r.loot?.hydrogen || 0;
  }
  return Object.values(hourlyMap).sort((a, b) => a.hour.localeCompare(b.hour));
}

function renderExpeditionsTab() {
  const mode = getMode();
  const periodLabel = mode === 'all' ? '' : mode === 'daily' ? ' (latest day)' : ' (latest hour)';
  const t = getExpTotalsForMode(mode);
  const el = document.getElementById('e-stats-collected');
  el.textContent = '';
  if (!store.exp_totals || !store.exp_totals.missions) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No expedition or wormhole reports recorded yet.';
    el.appendChild(p);
  } else {
    el.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
      makeStatCard(`Alloys${periodLabel}`, fmt(t.alloys), 'alloys'),
      makeStatCard(`Missions${periodLabel}`, fmt(t.missions), 'missions'),
      makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
    );
    appendRareCards(el, t.rare, periodLabel);
  }

  const series = getExpSeriesForMode(mode);
  const labelKey = getLabelKey(mode);
  if (chartExpeditions) chartExpeditions.destroy();
  chartExpeditions = new Chart(document.getElementById('chart-expeditions'), {
    type: 'line',
    data: {
      labels: series.map(r => r[labelKey]),
      datasets: [
        { label: 'Ore',       data: series.map(r => r.ore),       borderColor: '#f0883e', backgroundColor: '#f0883e22', fill: true, tension: 0.3 },
        { label: 'Silicates', data: series.map(r => r.silicates), borderColor: '#56d364', backgroundColor: '#56d36422', fill: true, tension: 0.3 },
        { label: 'Hydrogen',  data: series.map(r => r.hydrogen),  borderColor: '#79c0ff', backgroundColor: '#79c0ff22', fill: true, tension: 0.3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e6edf3' } } }, scales: SCALE_OPTS },
  });

  renderExpTable();
}

function renderExpTable() {
  const reports = (store.exp_recent_reports || []).slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  renderPagedTable(reports, expPage, 'e-page-info', 'e-btn-prev', 'e-btn-next', 'e-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdKind = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.kind;
    tdKind.appendChild(badge);
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location || '—';
    const tdEvent = document.createElement('td');
    tdEvent.textContent = r.event ? String(r.event).replace(/_/g, ' ') : '—';
    const tdLoot = document.createElement('td');
    tdLoot.textContent = Object.entries(r.loot || {})
      .map(([k, v]) => `${k}: ${Number(v).toLocaleString()}`)
      .join(', ') || '—';
    tr.append(tdDate, tdKind, tdLoc, tdEvent, tdLoot, zeroCell(r.ships_lost));
    return tr;
  });
}

document.getElementById('e-btn-prev').addEventListener('click', () => { expPage--; renderExpTable(); });
document.getElementById('e-btn-next').addEventListener('click', () => { expPage++; renderExpTable(); });

// ── Planet Finder tab ──────────────────────────────────────────────────────

const SCAN_CACHE_TTL = 24 * 3600 * 1000;   // planets rarely change
const SCAN_CACHE_MAX = 800;                // systems kept in the cache

let galaxySystems = null;     // full /api/galaxy/map systems array
let finderArms = null;
let finderInited = false;
let finderRunning = false;
let finderHits = [];          // matching planets
let hitSystems = {};          // systemId → {x, y, screenX, screenY, planets: []}
let mapBounds = null;

async function initFinderTab() {
  if (finderInited) return;
  finderInited = true;
  const status = document.getElementById('f-progress');
  status.textContent = 'Loading galaxy map…';
  const [arms, map] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_ARMS' }),
    browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' }),
  ]);
  if (arms.error || map.error) {
    status.textContent = `Error: ${arms.error || map.error}`;
    finderInited = false;
    return;
  }
  finderArms = arms.arms || [];
  galaxySystems = map.systems || [];

  const sel = document.getElementById('f-arm');
  sel.textContent = '';
  for (const a of finderArms) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name;
    sel.appendChild(o);
  }
  status.textContent = `${galaxySystems.length} systems loaded.`;
  drawGalaxyMap();
}

// Sector field accepts a single sector ("35") or a range ("33-35").
// Empty means the whole arm.
function regionSectorIds() {
  const armId = parseInt(document.getElementById('f-arm').value, 10) || 1;
  const arm = finderArms.find(a => a.id === armId) || { sectorCount: 50 };
  const raw = document.getElementById('f-sector').value.trim();
  let from = 1, to = arm.sectorCount;
  const m = raw.match(/^(\d+)\s*[-–—]\s*(\d+)$/) || raw.match(/^(\d+)$/);
  if (m) {
    from = parseInt(m[1], 10);
    to = m[2] !== undefined ? parseInt(m[2], 10) : from;
    if (to < from) [from, to] = [to, from];
  }
  from = Math.max(1, Math.min(arm.sectorCount, from));
  to = Math.max(1, Math.min(arm.sectorCount, to));
  const base = (armId - 1) * 50;
  return { armId, from, to, min: base + from, max: base + to };
}

function drawGalaxyMap() {
  const canvas = document.getElementById('f-map');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!galaxySystems) return;

  if (!mapBounds) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of galaxySystems) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    mapBounds = { minX, maxX, minY, maxY };
  }
  const pad = 14;
  const sx = x => pad + (x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX) * (canvas.width - 2 * pad);
  const sy = y => pad + (y - mapBounds.minY) / (mapBounds.maxY - mapBounds.minY) * (canvas.height - 2 * pad);

  const region = regionSectorIds();
  const inRegion = s => s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max;

  for (const s of galaxySystems) {
    const hit = hitSystems[s.id];
    let color, r;
    if (hit) { color = '#f0883e'; r = 3.5; }
    else if (inRegion(s)) { color = s.visibility === 'fog' || s.visibility === 'outline' ? '#6e5430' : '#e3b341'; r = 2; }
    else if (s.visibility === 'full' || s.visibility === 'partial') { color = '#2f5a8f'; r = 1.5; }
    else { color = '#21262d'; r = 1; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(s.x), sy(s.y), r, 0, Math.PI * 2);
    ctx.fill();
    if (hit) { hit.screenX = sx(s.x); hit.screenY = sy(s.y); }
  }
}

async function getSystemPlanets(systemId, cache) {
  const entry = cache[systemId];
  if (entry && Date.now() - entry.at < SCAN_CACHE_TTL) return entry.data;
  const data = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_PLANETS', systemId });
  if (data.error) throw new Error(data.error);
  cache[systemId] = { data, at: Date.now() };
  return data;
}

function moonCount(planet, moons) {
  return (moons || []).filter(m => m.planetId === planet.id || m.parentPlanetId === planet.id).length;
}

document.getElementById('f-search').addEventListener('click', async function () {
  if (finderRunning) {
    finderRunning = false;
    return;
  }
  if (!galaxySystems) return;

  const region = regionSectorIds();
  const wantType = document.getElementById('f-type').value;
  const minSize = parseInt(document.getElementById('f-min-size').value, 10) || 0;
  const minMoons = parseInt(document.getElementById('f-min-moons').value, 10) || 0;
  const ownership = document.getElementById('f-ownership').value; // '' | 'unowned' | 'owned'

  const candidates = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max &&
    (s.visibility === 'full' || s.visibility === 'partial'));
  const fogged = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max).length - candidates.length;

  const status = document.getElementById('f-progress');
  if (!candidates.length) {
    status.textContent = 'No scanned systems in that region — explore it first.';
    return;
  }

  finderRunning = true;
  this.textContent = 'Stop';
  finderHits = [];
  hitSystems = {};

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  let done = 0;
  try {
    for (const s of candidates) {
      if (!finderRunning) break;
      let data;
      try {
        data = await getSystemPlanets(s.id, cache);
      } catch (e) {
        status.textContent = `Error on ${s.name || s.id}: ${e.message}`;
        break;
      }
      const moons = data.moons || [];
      for (const p of (data.planets || [])) {
        if (wantType && p.planetType !== wantType) continue;
        if (p.size < minSize) continue;
        if (ownership === 'unowned' && p.userId != null) continue;
        if (ownership === 'owned' && p.userId == null) continue;
        const nMoons = moonCount(p, moons);
        if (nMoons < minMoons) continue;
        finderHits.push({
          planet: p.name, system: s.name || `#${s.id}`,
          sector: s.sectorId - (region.armId - 1) * 50,
          type: p.planetType, size: p.size, temp: p.temperature,
          moons: nMoons, owner: p.ownerName || null,
        });
        if (!hitSystems[s.id]) hitSystems[s.id] = { planets: [] };
        hitSystems[s.id].planets.push(`${p.name} (${p.planetType}, ${p.size}, ${nMoons} moons)`);
      }
      done++;
      if (done % 10 === 0) {
        status.textContent = `Scanning… ${done}/${candidates.length} systems, ${finderHits.length} matches.`;
        drawGalaxyMap();
      }
      await new Promise(r => setTimeout(r, 80)); // be polite to the game API
    }
  } finally {
    finderRunning = false;
    this.textContent = 'Search';
  }

  // Persist the scan cache, oldest entries dropped first.
  const ids = Object.keys(cache);
  if (ids.length > SCAN_CACHE_MAX) {
    ids.sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, ids.length - SCAN_CACHE_MAX)
      .forEach(id => delete cache[id]);
  }
  await browser.storage.local.set({ planet_scan_cache: cache });

  status.textContent = `Done: ${finderHits.length} matches in ${done} scanned systems` +
    (fogged ? ` (${fogged} more systems in the region are unexplored).` : '.');
  drawGalaxyMap();
  renderFinderResults();
});

let finderSort = { key: 'size', dir: -1 };

document.getElementById('f-results-head').addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const key = th.dataset.key;
  finderSort = { key, dir: finderSort.key === key ? -finderSort.dir : -1 };
  renderFinderResults();
});

function renderFinderResults() {
  const tbody = document.getElementById('f-results-tbody');
  tbody.textContent = '';
  document.getElementById('f-match-count').textContent = `${finderHits.length} planets`;

  // Header arrows
  document.querySelectorAll('#f-results-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === finderSort.key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = finderSort.dir === -1 ? '▼' : '▲';
      th.appendChild(arrow);
    }
  });

  const { key, dir } = finderSort;
  const sorted = finderHits.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || b.size - a.size;
  });
  for (const h of sorted) {
    const tr = document.createElement('tr');
    const cells = [h.planet, h.system, String(h.sector), String(h.type ?? '—').replace(/_/g, ' '),
                   String(h.size), (h.temp == null ? '—' : `${h.temp}°`), String(h.moons), h.owner || '—'];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 4) td.style.color = '#e3b341';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

// Hover tooltip over hit systems
document.getElementById('f-map').addEventListener('mousemove', e => {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const tip = document.getElementById('f-tooltip');
  for (const hit of Object.values(hitSystems)) {
    if (hit.screenX != null && Math.hypot(hit.screenX - x, hit.screenY - y) < 8) {
      tip.textContent = hit.planets.join(' · ');
      tip.style.display = '';
      tip.style.left = `${e.clientX - rect.left + 14}px`;
      tip.style.top = `${e.clientY - rect.top + 14}px`;
      return;
    }
  }
  tip.style.display = 'none';
});

['f-arm', 'f-sector'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (galaxySystems) drawGalaxyMap();
  });
});

// ── Tabs ───────────────────────────────────────────────────────────────────

const TAB_CONTENT = {
  surveys: 'main-content',
  pirates: 'pirates-content',
  mining: 'mining-content',
  debris: 'debris-content',
  expeditions: 'expeditions-content',
  finder: 'finder-content',
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
      (activeTab === 'finder' || activeTab === 'debris') ? 'none' : '';
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

document.getElementById('mode-select').addEventListener('change', () => {
  currentPage = 1;
  pirateCurrentPage = 1;
  miningPage = 1;
  expPage = 1;
  renderAll();
});

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
    'survey_archive', 'pirate_archive', 'mining_archive', 'exp_archive',
    'recent_reports', 'pirate_recent_reports', 'mining_recent_reports', 'exp_recent_reports',
  ]);
  const n = (s.survey_archive || s.recent_reports || []).length +
            (s.pirate_archive || s.pirate_recent_reports || []).length +
            (s.mining_archive || s.mining_recent_reports || []).length +
            (s.exp_archive || s.exp_recent_reports || []).length;
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
    'pirate_debris_total', 'debris_collected_est',
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
