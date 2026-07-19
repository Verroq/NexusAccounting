// Expeditions tab. Wormhole runs have their own tab (tabs/wormholes.js) —
// both kinds share one background store (exp_*), tagged per-record by `kind`.

import { RESOURCE_SERIES, appendExtraResourceCards, applySort, attachSortable, computeSeries, filterZone, fmt, fuelForMode, getLabelKey, getMode, inWindowRange, makeResourceDoughnut, makeResourceLineChart, makeStatCard, periodLabelFor, renderPagedTable, store, windowActive, zeroCell, zoneCell } from '../common.js';

export let chartExpeditions, chartExpComp;

export let expPage = 1;

// Expedition-kind records for the current view + zone filter.
export function expRecordsForMode(mode) {
  const filtered = filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'expedition'));
  if (mode === 'all' && !windowActive()) return filtered;
  return inWindowRange(filtered);
}

// Per-report records carry the full loot map, so all resources (rares included)
// work in every view mode + zone. No combined-totals fast path here (unlike
// the pre-split tab) since store.exp_totals mixes in wormhole runs too.
export function getExpTotalsForMode(mode) {
  const t = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  for (const r of expRecordsForMode(mode)) {
    for (const [k, v] of Object.entries(r.loot || {})) {
      if (k in t && k !== 'rare' && k !== 'missions' && k !== 'ships_lost') t[k] += v;
      else if (!['ore', 'silicates', 'hydrogen', 'alloys'].includes(k)) t.rare[k] = (t.rare[k] || 0) + v;
    }
    t.missions += 1;
    t.ships_lost += r.ships_lost || 0;
  }
  return t;
}

// Loot-over-time series; loot lives in r.loot (full map per record).
export function getExpSeriesForMode(mode) {
  const getters = { missions: () => 1 };
  for (const d of RESOURCE_SERIES) getters[d.field] = r => (r.loot && r.loot[d.field]) || 0;
  return computeSeries(filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'expedition')), mode, getters);
}

export function renderExpeditionsTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const t = getExpTotalsForMode(mode);
  const el = document.getElementById('e-stats-collected');
  el.textContent = '';
  if (!t.missions) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No expedition reports recorded yet.';
    el.appendChild(p);
  } else {
    el.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
    );
    appendExtraResourceCards(el, t, periodLabel);
    el.append(
      makeStatCard(`Missions${periodLabel}`, fmt(t.missions), 'missions'),
      makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
      makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('expedition', mode)), 'hydrogen'),
    );
  }

  if (chartExpeditions) chartExpeditions.destroy();
  chartExpeditions = makeResourceLineChart('chart-expeditions', getExpSeriesForMode(mode),
    getLabelKey(mode), { field: 'missions', label: 'Missions' });

  if (chartExpComp) chartExpComp.destroy();
  chartExpComp = makeResourceDoughnut('chart-expeditions-comp', t);

  renderExpTable();
}

export const expSort = { key: 'created_at', dir: -1 };
attachSortable('e-reports-head', expSort, () => { expPage = 1; renderExpTable(); });

export function renderExpTable() {
  const reports = applySort('e-reports-head', filterZone((store.exp_recent_reports || []).filter(r => r.kind === 'expedition')), expSort);
  renderPagedTable(reports, expPage, 'e-page-info', 'e-btn-prev', 'e-btn-next', 'e-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location || '—';
    const tdEvent = document.createElement('td');
    tdEvent.textContent = r.event ? String(r.event).replace(/_/g, ' ') : '—';
    const loot = r.loot || {};
    const tdOre = zeroCell(loot.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(loot.silicates); tdSil.className = 'silicates';
    const tdHyd = zeroCell(loot.hydrogen); tdHyd.className = 'hydrogen';
    const tdAll = zeroCell(loot.alloys); tdAll.className = 'alloys';
    tr.append(tdDate, tdLoc, zoneCell(r.zone), tdEvent,
              tdOre, tdSil, tdHyd, tdAll,
              zeroCell(loot.cryo_ice), zeroCell(loot.quantum_dust), zeroCell(loot.plasma_core),
              zeroCell(loot.dark_matter), zeroCell(loot.antimatter),
              zeroCell(r.ships_lost));
    return tr;
  });
}

document.getElementById('e-btn-prev').addEventListener('click', () => { expPage--; renderExpTable(); });
document.getElementById('e-btn-next').addEventListener('click', () => { expPage++; renderExpTable(); });

export function setExpPage(n) { expPage = n; }
