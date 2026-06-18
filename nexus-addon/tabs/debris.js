// Debris tab.

// ── Debris tab ─────────────────────────────────────────────────────────────

let chartDebris, chartDebrisPeriod;
const debrisSort = { key: 'ore', dir: -1 };
attachSortable('d-fields-head', debrisSort, () => renderDebrisTab());

// Collection log mapped so the shared mode/zone helpers (which key on
// created_at) work on it.
function debrisLog() {
  return (store.debris_collection_log || []).map(r => ({ ...r, created_at: r.collected_at }));
}

// Collected-over-time series from the collection log.
function getDebrisSeries(mode) {
  const getters = { runs: () => 1 };
  for (const d of RESOURCE_SERIES) getters[d.field] = r => r[d.field] || 0;
  return computeSeries(filterZone(debrisLog()), mode, getters);
}

// Collected totals for the current view + zone. All-time/unfiltered uses the
// precise cumulative total; period/zone sums the (capped) collection log.
function getDebrisCollectedForMode(mode) {
  if (mode === 'all' && getZone() === 'all') {
    return store.debris_collected || { ore: 0, silicates: 0, alloys: 0, hydrogen: 0 };
  }
  const rows = filterZone(mode === 'all' ? debrisLog() : latestBucket(debrisLog(), mode));
  const t = { ore: 0, silicates: 0, hydrogen: 0 };
  for (const r of rows) {
    t.ore += r.ore || 0; t.silicates += r.silicates || 0; t.hydrogen += r.hydrogen || 0;
    for (const k of EXTRA_RES_KEYS_UI) t[k] = (t[k] || 0) + (r[k] || 0);
  }
  return t;
}

function renderDebrisTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  // Precise collection by your own fleets, for the current view + zone.
  const mine = getDebrisCollectedForMode(mode);
  const mineEl = document.getElementById('d-stats-mine');
  mineEl.textContent = '';
  mineEl.append(
    makeStatCard(`Ore${periodLabel}`, fmt(mine.ore), 'ore'),
    makeStatCard(`Silicates${periodLabel}`, fmt(mine.silicates), 'silicates'),
    makeStatCard(`Hydrogen${periodLabel}`, fmt(mine.hydrogen), 'hydrogen'),
  );
  appendExtraResourceCards(mineEl, mine, periodLabel);
  mineEl.append(
    makeStatCard(`Runs${periodLabel}`, fmt(filterZone(mode === 'all' ? debrisLog() : latestBucket(debrisLog(), mode)).length), 'missions'),
  );

  const lost = store.debris_resources_lost || { destroyed: {}, repair: {} };
  fillResourceCards('d-stats-lost', lost.destroyed, '');

  if (chartDebris) chartDebris.destroy();
  chartDebris = makeResourceDoughnut('chart-debris', mine);

  if (chartDebrisPeriod) chartDebrisPeriod.destroy();
  chartDebrisPeriod = makeResourceLineChart('chart-debris-period', getDebrisSeries(mode),
    getLabelKey(mode), { field: 'runs', label: 'Runs' });

  renderActiveRuns();
  renderCollectionLog();

  const gen = store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  const genEl = document.getElementById('d-stats-generated');
  genEl.textContent = '';
  genEl.append(
    makeStatCard('Ore', fmt(gen.ore), 'ore'),
    makeStatCard('Silicates', fmt(gen.silicates), 'silicates'),
  );
  appendExtraResourceCards(genEl, gen, '');

  document.getElementById('d-last-check').textContent = store.debris_last_check
    ? `Last check: ${new Date(store.debris_last_check).toLocaleString()}`
    : 'Not checked yet.';

  const tbody = document.getElementById('d-fields-tbody');
  tbody.textContent = '';
  const fields = applySort('d-fields-head', store.debris_fields || [], debrisSort, 'system');
  if (!fields.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
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
    tr.append(tdSys, zoneCell(f.zone), tdOre, tdSil, tdAl, tdHyd, tdFirst, tdUpd);
    tbody.appendChild(tr);
  }
}

function cargoText(r) {
  return ['ore', 'silicates', 'alloys', 'hydrogen']
    .filter(k => r[k]).map(k => `${k}: ${Number(r[k]).toLocaleString()}`).join(', ') || '—';
}

function fleetText(fleet) {
  return (fleet || []).map(f => `${f.quantity}× ${(f.key || '?').replace(/_/g, ' ')}`).join(', ') || '—';
}

function renderActiveRuns() {
  const tbody = document.getElementById('d-active-tbody');
  tbody.textContent = '';
  const runs = (store.debris_active_runs || []).slice()
    .sort((a, b) => String(a.eta || '').localeCompare(String(b.eta || '')));
  if (!runs.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6; td.style.color = '#484f58';
    td.textContent = 'No debris-collection fleets in flight.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  for (const r of runs) {
    const tr = document.createElement('tr');
    const tdFleet = document.createElement('td'); tdFleet.textContent = fleetText(r.fleet);
    const tdSys = document.createElement('td'); tdSys.textContent = r.system;
    const tdStatus = document.createElement('td'); tdStatus.textContent = r.status;
    const tdCargo = document.createElement('td'); tdCargo.textContent = cargoText(r);
    const tdEta = document.createElement('td');
    tdEta.textContent = r.eta ? new Date(r.eta).toLocaleString() : '—';
    tr.append(tdFleet, tdSys, zoneCell(r.zone), tdStatus, tdCargo, tdEta);
    tbody.appendChild(tr);
  }
}

const collectedSort = { key: 'collected_at', dir: -1 };
attachSortable('d-collected-head', collectedSort, () => renderCollectionLog());

function renderCollectionLog() {
  const tbody = document.getElementById('d-collected-tbody');
  tbody.textContent = '';
  const log = applySort('d-collected-head', store.debris_collection_log || [], collectedSort, 'collected_at');
  if (!log.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12; td.style.color = '#484f58';
    td.textContent = 'No collections recorded yet — they appear when a collect-debris fleet returns.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  for (const r of log.slice(0, PER_PAGE)) {
    const tr = document.createElement('tr');
    const tdWhen = document.createElement('td');
    tdWhen.textContent = new Date(r.collected_at).toLocaleString();
    const tdSys = document.createElement('td'); tdSys.textContent = r.system;
    const tdOre = zeroCell(r.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(r.silicates); tdSil.className = 'silicates';
    const tdAl = zeroCell(r.alloys); tdAl.className = 'alloys';
    const tdHyd = zeroCell(r.hydrogen); tdHyd.className = 'hydrogen';
    tr.append(tdWhen, tdSys, zoneCell(r.zone), tdOre, tdSil, tdAl, tdHyd,
              zeroCell(r.ice), zeroCell(r.quantum_dust), zeroCell(r.plasma_core),
              zeroCell(r.dark_matter), zeroCell(r.antimatter));
    tbody.appendChild(tr);
  }
}
