let chartResources, chartEvents, chartByEvent;
let store = {};   // full storage snapshot
let currentPage = 1;
const PER_PAGE = 20;

function fmt(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}

// ── Storage ────────────────────────────────────────────────────────────────

async function loadAll() {
  store = await browser.storage.local.get([
    'totals', 'daily', 'hourly', 'resources_lost', 'event_breakdown',
    'recent_reports', 'ships', 'last_scrape', 'last_error', 'records_cap',
  ]);

  const cap = store.records_cap ?? 500;
  document.getElementById('records-cap').value = cap === Infinity ? 0 : cap;
  updateStatus(store.last_scrape, store.last_error);
  renderAll();
}

function updateStatus(lastScrape, lastError) {
  const el = document.getElementById('status-text');
  if (lastError) {
    el.innerHTML = `<span class="error">Error: ${lastError}</span>`;
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

function renderCollected(t, periodLabel) {
  const noData = !store.totals || !store.totals.missions;
  if (noData) {
    document.getElementById('stats-collected').innerHTML =
      `<p style="color:#484f58;padding:8px 0">No data yet — log in to <a href="https://s0.nexuslegacy.space" target="_blank" style="color:#58a6ff">Nexus Legacy</a> then click Scrape Now.</p>`;
    return;
  }
  document.getElementById('stats-collected').innerHTML = `
    <div class="stat-card"><div class="label">Ore${periodLabel}</div><div class="value ore">${fmt(t.ore)}</div></div>
    <div class="stat-card"><div class="label">Hydrogen${periodLabel}</div><div class="value hydrogen">${fmt(t.hydrogen)}</div></div>
    <div class="stat-card"><div class="label">Silicates${periodLabel}</div><div class="value silicates">${fmt(t.silicates)}</div></div>
    <div class="stat-card"><div class="label">Missions${periodLabel}</div><div class="value missions">${fmt(t.missions)}</div></div>
    <div class="stat-card"><div class="label">Ships lost${periodLabel}</div><div class="value" style="color:#ff7b72">${fmt(t.ships_lost)}</div></div>
  `;
}

function renderLost(rl, periodLabel) {
  const rareCards = Object.entries(rl.rare || {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div class="stat-card"><div class="label">${k.replace(/_/g, ' ')}${periodLabel}</div><div class="value rare">${fmt(v)}</div></div>`)
    .join('');

  document.getElementById('stats-lost').innerHTML = `
    <div class="stat-card"><div class="label">Ore lost${periodLabel}</div><div class="value ore">${fmt(rl.ore)}</div></div>
    <div class="stat-card"><div class="label">Silicates lost${periodLabel}</div><div class="value silicates">${fmt(rl.silicates)}</div></div>
    <div class="stat-card"><div class="label">Hydrogen lost${periodLabel}</div><div class="value hydrogen">${fmt(rl.hydrogen)}</div></div>
    <div class="stat-card"><div class="label">Alloys lost${periodLabel}</div><div class="value alloys">${fmt(rl.alloys)}</div></div>
    ${rareCards}
  `;
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
  const allReports = store.recent_reports || [];
  const totalPages = Math.ceil(allReports.length / PER_PAGE);
  document.getElementById('page-info').textContent = `Page ${currentPage} / ${Math.max(1, totalPages)} (${allReports.length} total)`;
  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;

  const slice = allReports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const z = v => v ? v.toLocaleString() : '<span class="zero">—</span>';
  document.getElementById('reports-tbody').innerHTML = slice.map(r => `<tr>
    <td>${new Date(r.created_at).toLocaleString()}</td>
    <td>${r.system_name ?? '—'}</td>
    <td><span class="badge ${r.event_type}">${r.event_type.replace(/_/g, ' ')}</span></td>
    <td class="ore">${z(r.ore)}</td>
    <td class="hydrogen">${z(r.hydrogen)}</td>
    <td class="silicates">${z(r.silicates)}</td>
    <td>${r.ships_lost || '<span class="zero">—</span>'}</td>
    <td>${r.ships_damaged || '<span class="zero">—</span>'}</td>
    <td>${r.wormholes_detected || '<span class="zero">—</span>'}</td>
  </tr>`).join('');
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
}

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
  if (store.totals) renderAll();
});

document.getElementById('btn-reset').addEventListener('click', async function () {
  if (!confirm('Drop all survey records? This cannot be undone.')) return;
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

// ── Init ───────────────────────────────────────────────────────────────────

loadAll();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.totals) loadAll();
});
