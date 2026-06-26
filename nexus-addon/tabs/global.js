// Global tab: totals aggregated across every source, honouring the View,
// Zone and Window selectors.

import { EXTRA_RES_KEYS_UI, RARE_WEIGHT, RESOURCE_WEIGHTS, SERIES_GETTERS, appendExtraResourceCards, combinedLost, computeResourcesLost, computeSeries, dayKey, emptyResources, fmt, fuelForMode, getLabelKey, getMode, getWindowRange, getZone, makeResourceDoughnut, windowActive, makeResourceLineChart, makeStatCard, periodLabelFor, renderNetCards, resourceVal, store } from '../common.js';

export let chartGlobal, chartGlobalPeriod, chartGlobalSrc;

// Resource keys we total (core + alloys + exotics).
export const GLOBAL_RES_KEYS = ['ore', 'silicates', 'hydrogen', ...EXTRA_RES_KEYS_UI];

export const SOURCE_COLORS = {
  Survey: '#58a6ff', Pirates: '#ff7b72', Mining: '#e3b341',
  Debris: '#56d364', Expeditions: '#bc8cff',
};

// Weighted value of a resource bag (ore×1 … alloys×5, exotics×10).
export function weightedValue(res) {
  let v = 0;
  for (const k of GLOBAL_RES_KEYS) v += resourceVal(res, k) * (RESOURCE_WEIGHTS[k] || RARE_WEIGHT);
  return v;
}

// Per-report records from every source, tagged { src, r } and normalised to
// flat resource fields + created_at + zone (+ loss detail where available).
export function globalRecords() {
  const recs = [];
  const add = (src, list, norm) => {
    for (const r of (list || [])) recs.push({ src, r: norm ? norm(r) : r });
  };
  add('Survey', store.recent_reports);
  add('Pirates', store.pirate_recent_reports);
  add('Mining', store.mining_recent_reports);
  add('Expeditions', store.exp_recent_reports, r => {
    const o = { created_at: r.created_at, zone: r.zone, ships_lost_detail: r.ships_lost_detail };
    for (const k of GLOBAL_RES_KEYS) o[k] = (r.loot && r.loot[k]) || 0;
    return o;
  });
  add('Debris', store.debris_collection_log, r => {
    const o = { created_at: r.collected_at, zone: r.zone };
    for (const k of GLOBAL_RES_KEYS) o[k] = r[k] || 0;
    return o;
  });
  return recs;
}

export function sumResources(records) {
  const c = emptyResources();
  for (const r of records) {
    for (const k of GLOBAL_RES_KEYS) {
      if (k in c) c[k] += r[k] || 0;
      else c.rare[k] = (c.rare[k] || 0) + (r[k] || 0);
    }
  }
  return c;
}

export function globalLostAllTime() {
  const lost = emptyResources();
  for (const L of [store.resources_lost, store.pirate_resources_lost,
    store.mining_resources_lost, store.debris_resources_lost, store.exp_resources_lost]) {
    if (!L) continue;
    const cc = combinedLost(L);
    for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) lost[k] += cc[k] || 0;
    for (const [k, v] of Object.entries(cc.rare || {})) lost.rare[k] = (lost.rare[k] || 0) + v;
  }
  return lost;
}

export function renderGlobalTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const ships = store.ships || {};
  const allTime = mode === 'all' && getZone() === 'all' && !windowActive();

  const fuel = fuelForMode('all', mode);
  let collected, lost, bySrc, ops;
  if (allTime) {
    const srcTotals = {
      Survey: store.totals, Pirates: store.pirate_totals, Mining: store.mining_totals,
      Debris: store.debris_collected, Expeditions: store.exp_totals,
    };
    collected = emptyResources();
    bySrc = {};
    for (const [src, t] of Object.entries(srcTotals)) {
      if (!t) continue;
      for (const k of GLOBAL_RES_KEYS) {
        if (k in collected) collected[k] += resourceVal(t, k);
        else collected.rare[k] = (collected.rare[k] || 0) + resourceVal(t, k);
      }
      bySrc[src] = weightedValue(t);
    }
    lost = { destroyed: globalLostAllTime(), repair: emptyResources() };
    ops = (store.totals?.missions || 0) + (store.pirate_totals?.raids || 0)
      + (store.mining_totals?.deliveries || 0) + ((store.debris_collection_log || []).length)
      + (store.exp_totals?.missions || 0);
  } else {
    let items = globalRecords().filter(w => getZone() === 'all' || w.r.zone === getZone());
    const { from, to } = getWindowRange();
    if (from || to) items = items.filter(w => {
      const day = dayKey(w.r.created_at);
      return (!from || day >= from) && (!to || day <= to);
    });
    const recs = items.map(w => w.r);
    collected = sumResources(recs);
    lost = computeResourcesLost(recs, ships);
    ops = recs.length;
    bySrc = {};
    for (const w of items) bySrc[w.src] = (bySrc[w.src] || 0) + weightedValue(w.r);
  }

  const cEl = document.getElementById('g-stats-collected');
  cEl.textContent = '';
  cEl.append(
    makeStatCard(`Ore${periodLabel}`, fmt(collected.ore), 'ore'),
    makeStatCard(`Silicates${periodLabel}`, fmt(collected.silicates), 'silicates'),
    makeStatCard(`Hydrogen${periodLabel}`, fmt(collected.hydrogen), 'hydrogen'),
  );
  appendExtraResourceCards(cEl, collected, periodLabel);
  cEl.appendChild(makeStatCard(`Operations${periodLabel}`, fmt(ops), 'missions'));

  renderNetCards('g-stats-net', collected, lost, periodLabel, fuel);

  const series = computeSeries(globalRecords().filter(w => getZone() === 'all' || w.r.zone === getZone()).map(w => w.r),
    mode, { ...SERIES_GETTERS, count: () => 1 });
  if (chartGlobalPeriod) chartGlobalPeriod.destroy();
  chartGlobalPeriod = makeResourceLineChart('chart-global-period', series, getLabelKey(mode),
    { field: 'count', label: 'Reports' });

  if (chartGlobal) chartGlobal.destroy();
  chartGlobal = makeResourceDoughnut('chart-global', collected);

  renderSourceShare(bySrc);
}

// Doughnut of each source's share of the (weighted) collected value.
export function renderSourceShare(bySrc) {
  const entries = Object.entries(bySrc).filter(([, v]) => v > 0);
  const totalV = entries.reduce((s, e) => s + e[1], 0);
  if (chartGlobalSrc) chartGlobalSrc.destroy();
  chartGlobalSrc = new Chart(document.getElementById('chart-global-source'), {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: entries.map(e => SOURCE_COLORS[e[0]]) }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#e6edf3', font: { size: 11 },
            generateLabels: () => entries.map(([src, v], i) => ({
              text: `${src} — ${totalV ? ((v / totalV) * 100).toFixed(1) : 0}%`,
              fillStyle: SOURCE_COLORS[src],
              strokeStyle: SOURCE_COLORS[src],
              fontColor: '#e6edf3',
              index: i,
            })),
          },
        },
        tooltip: {
          callbacks: {
            label: c => {
              const pct = totalV ? ((c.parsed / totalV) * 100).toFixed(1) : 0;
              return `${c.label}: ${pct}%`;
            },
          },
        },
      },
    },
  });
}
