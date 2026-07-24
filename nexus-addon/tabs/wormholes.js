// Wormhole runs tab. Expeditions have their own tab (tabs/expeditions.js) —
// both kinds share one background store (exp_*), tagged per-record by `kind`.

import { RESOURCE_SERIES, appendExtraResourceCards, applySort, attachSortable, computeRawLossCost, computeSeries, fillResourceCards, filterZone, fmt, fuelForMode, getLabelKey, getMode, inWindowRange, isUnfiltered, makeResourceDoughnut, makeResourceLineChart, makeStatCard, periodLabelFor, renderPagedTable, store, windowActive, zeroCell, zoneCell } from '../common.js';

export let chartWormholes, chartWhComp;

export let whPage = 1;

// Wormhole-class filter, combines with the global view + zone.
export function getWhClass() {
  const el = document.getElementById('wclass-select');
  return el ? el.value : 'all';
}
export function filterClass(reports) {
  const c = getWhClass();
  return c === 'all' ? reports : (reports || []).filter(r => (r.wclass || 'unknown') === c);
}
export function whUnfiltered() {
  return isUnfiltered() && getWhClass() === 'all';
}
// Wormhole-kind records for the current view, zone and class filters.
export function whRecordsForMode(mode) {
  const filtered = filterClass(filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'wormhole')));
  if (mode === 'all' && !windowActive()) return filtered;
  return inWindowRange(filtered);
}

// Per-report records carry the full loot map, so all resources (rares included)
// work in every view mode + zone + class. No combined-totals fast path here
// (unlike the pre-split tab) since store.exp_totals mixes in expeditions too.
export function getWhTotalsForMode(mode) {
  const t = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  for (const r of whRecordsForMode(mode)) {
    for (const [k, v] of Object.entries(r.loot || {})) {
      if (k in t && k !== 'rare' && k !== 'missions' && k !== 'ships_lost') t[k] += v;
      else if (!['ore', 'silicates', 'hydrogen', 'alloys'].includes(k)) t.rare[k] = (t.rare[k] || 0) + v;
    }
    t.missions += 1;
    t.ships_lost += r.ships_lost || 0;
  }
  return t;
}

// Populate the class dropdown from classes present, preserving selection.
export function populateClassOptions() {
  const sel = document.getElementById('wclass-select');
  if (!sel) return;
  const classes = [...new Set((store.exp_recent_reports || []).filter(r => r.kind === 'wormhole').map(r => r.wclass).filter(Boolean))].sort();
  const current = sel.value;
  sel.textContent = '';
  const all = document.createElement('option');
  all.value = 'all'; all.textContent = 'All classes';
  sel.appendChild(all);
  for (const c of classes) {
    const o = document.createElement('option');
    o.value = c; o.textContent = c.toUpperCase();
    sel.appendChild(o);
  }
  sel.value = classes.includes(current) || current === 'all' ? current : 'all';
}

// Loot-over-time series; loot lives in r.loot (full map per record).
export function getWhSeriesForMode(mode) {
  const getters = { missions: () => 1 };
  for (const d of RESOURCE_SERIES) getters[d.field] = r => (r.loot && r.loot[d.field]) || 0;
  return computeSeries(filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'wormhole')), mode, getters);
}

export function renderWormholesTab() {
  populateClassOptions();
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const t = getWhTotalsForMode(mode);
  const el = document.getElementById('w-stats-collected');
  el.textContent = '';
  if (!t.missions) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No wormhole runs recorded yet.';
    el.appendChild(p);
  } else {
    el.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
    );
    appendExtraResourceCards(el, t, periodLabel);
    el.append(
      makeStatCard(`Runs${periodLabel}`, fmt(t.missions), 'missions'),
      makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
      makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('expedition', mode)), 'hydrogen'),
    );
  }

  const lost = computeRawLossCost(whRecordsForMode(mode), store.ships || {});
  fillResourceCards('w-stats-lost', lost, '');

  if (chartWormholes) chartWormholes.destroy();
  chartWormholes = makeResourceLineChart('chart-wormholes', getWhSeriesForMode(mode),
    getLabelKey(mode), { field: 'missions', label: 'Runs' });

  if (chartWhComp) chartWhComp.destroy();
  chartWhComp = makeResourceDoughnut('chart-wormholes-comp', t);

  renderWhTable();
}

export const whSort = { key: 'created_at', dir: -1 };
attachSortable('w-reports-head', whSort, () => { whPage = 1; renderWhTable(); });

export function renderWhTable() {
  const reports = applySort('w-reports-head', filterClass(filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'wormhole'))), whSort);
  renderPagedTable(reports, whPage, 'w-page-info', 'w-btn-prev', 'w-btn-next', 'w-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdClass = document.createElement('td');
    tdClass.textContent = r.wclass ? r.wclass.toUpperCase() : '—';
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location || '—';
    const tdEvent = document.createElement('td');
    tdEvent.textContent = r.event ? String(r.event).replace(/_/g, ' ') : '—';
    const loot = r.loot || {};
    const tdOre = zeroCell(loot.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(loot.silicates); tdSil.className = 'silicates';
    const tdHyd = zeroCell(loot.hydrogen); tdHyd.className = 'hydrogen';
    const tdAll = zeroCell(loot.alloys); tdAll.className = 'alloys';
    tr.append(tdDate, tdClass, tdLoc, zoneCell(r.zone), tdEvent,
              tdOre, tdSil, tdHyd, tdAll,
              zeroCell(loot.cryo_ice), zeroCell(loot.quantum_dust), zeroCell(loot.plasma_core),
              zeroCell(loot.dark_matter), zeroCell(loot.antimatter),
              zeroCell(r.ships_lost));
    return tr;
  });
}

document.getElementById('w-btn-prev').addEventListener('click', () => { whPage--; renderWhTable(); });
document.getElementById('w-btn-next').addEventListener('click', () => { whPage++; renderWhTable(); });
document.getElementById('wclass-select').addEventListener('change', () => { whPage = 1; renderWormholesTab(); });

export function setWhPage(n) { whPage = n; }
