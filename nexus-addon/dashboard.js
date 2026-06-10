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
  ]);

  const cap = store.records_cap ?? 500;
  document.getElementById('records-cap').value = cap === Infinity ? 0 : cap;
  updateStatus(store.last_scrape, store.last_error);
  renderAll();
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

// ── Tabs ───────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('main-content').style.display = activeTab === 'surveys' ? '' : 'none';
    document.getElementById('pirates-content').style.display = activeTab === 'pirates' ? '' : 'none';
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
  if (store.totals || store.pirate_totals) renderAll();
});

document.getElementById('btn-reset').addEventListener('click', async function () {
  if (!confirm('Drop all survey and pirate records? This cannot be undone.')) return;
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
    const exportedAt = payload.exported_at ? new Date(payload.exported_at).toLocaleString() : 'unknown date';
    if (!confirm(`Replace ALL current data with backup from ${exportedAt}? This cannot be undone.`)) return;

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
