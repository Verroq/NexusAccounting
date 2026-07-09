// Pirates tab.

import { EXTRA_RES_KEYS_UI, PER_PAGE, SERIES_GETTERS, appendExtraResourceCards, applySort, attachSortable, computeResourcesLost, computeSeries, emptyResources, filterZone, fmt, fuelForMode, getLabelKey, getMode, isUnfiltered, makeResourceLineChart, makeStatCard, periodLabelFor, recordsForMode, renderLostCards, renderNetCards, store, windowActive, zoneCell } from '../common.js';

export let chartPirateLoot, chartPirateOutcomes;

export let pirateCurrentPage = 1;

// ── Pirates tab ────────────────────────────────────────────────────────────

export function getPirateTotalsForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered() && !windowActive()) return store.pirate_totals || {};
  return recordsForMode(store.pirate_recent_reports, mode).reduce((t, r) => ({
    ore: t.ore + (r.ore || 0),
    hydrogen: t.hydrogen + (r.hydrogen || 0),
    silicates: t.silicates + (r.silicates || 0),
    raids: t.raids + 1,
    ships_destroyed: t.ships_destroyed + (r.ships_lost || 0),
    ships_damaged: t.ships_damaged + (r.ships_damaged || 0),
    pirates_destroyed: t.pirates_destroyed + (r.pirates_destroyed || 0),
    ...Object.fromEntries(EXTRA_RES_KEYS_UI.map(k => [k, (t[k] || 0) + (r[k] || 0)])),
  }), { ore: 0, hydrogen: 0, silicates: 0, raids: 0, ships_destroyed: 0, ships_damaged: 0, pirates_destroyed: 0 });
}

export function getPirateLostForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered() && !windowActive()) return store.pirate_resources_lost || emptyResources();
  return computeResourcesLost(recordsForMode(store.pirate_recent_reports, mode), store.ships || {});
}

export function getPirateDebrisForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered() && !windowActive()) return store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  return recordsForMode(store.pirate_recent_reports, mode).reduce((t, r) => ({
    ore: t.ore + (r.debris_ore || 0),
    alloys: t.alloys + (r.debris_alloys || 0),
    silicates: t.silicates + (r.debris_silicates || 0),
  }), { ore: 0, alloys: 0, silicates: 0 });
}

export function getPirateOutcomesForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered() && !windowActive()) return store.pirate_outcomes || [];
  const map = {};
  for (const r of recordsForMode(store.pirate_recent_reports, mode)) {
    const o = r.outcome || 'unknown';
    if (!map[o]) map[o] = { outcome: o, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[o].count += 1;
    map[o].ore += r.ore || 0;
    map[o].hydrogen += r.hydrogen || 0;
    map[o].silicates += r.silicates || 0;
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

export function getPirateSeriesForMode() {
  const mode = getMode();
  if (mode !== 'hourly' && isUnfiltered() && !windowActive()) return store.pirate_daily || [];
  return computeSeries(filterZone(store.pirate_recent_reports || []), mode,
    { ...SERIES_GETTERS, raids: () => 1 });
}

export function renderPiratesTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
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
    );
    appendExtraResourceCards(collected, t, periodLabel);
    collected.append(
      makeStatCard(`Raids${periodLabel}`,     fmt(t.raids),     'missions'),
      makeStatCard(`Ships destroyed${periodLabel}`, fmt(t.ships_destroyed), '', 'color:#ff7b72'),
      makeStatCard(`Pirates destroyed${periodLabel}`, fmt(t.pirates_destroyed), '', 'color:#56d364'),
      makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('pirate', getMode())), 'hydrogen'),
    );
  }

  renderLostCards('p-stats-lost', 'p-stats-repair', rl, periodLabel);
  renderNetCards('p-stats-net', t, rl, periodLabel, fuelForMode('pirate', getMode()));

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

export function renderPirateLootChart(series, labelKey) {
  if (chartPirateLoot) chartPirateLoot.destroy();
  chartPirateLoot = makeResourceLineChart('chart-pirate-loot', series, labelKey, { field: 'raids', label: 'Raids' });
}

export function renderPirateOutcomesChart(outcomes) {
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

export const pirateSort = { key: 'created_at', dir: -1 };
attachSortable('p-reports-head', pirateSort, () => { pirateCurrentPage = 1; renderPirateTable(); });

export function renderPirateTable() {
  const allReports = applySort('p-reports-head', filterZone(store.pirate_recent_reports || []), pirateSort);
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
    const tdAll = zeroTd(r.alloys);    tdAll.className = 'alloys';

    tr.append(tdDate, tdCamp, zoneCell(r.zone), tdOutcome, tdOre, tdHyd, tdSil, tdAll,
              zeroTd(r.cryo_ice), zeroTd(r.quantum_dust), zeroTd(r.plasma_core),
              zeroTd(r.dark_matter), zeroTd(r.antimatter),
              zeroTd(r.ships_lost), zeroTd(r.ships_damaged), zeroTd(r.pirates_destroyed));
    tbody.appendChild(tr);
  }
}

export function changePiratePage(delta) {
  pirateCurrentPage += delta;
  renderPirateTable();
}

document.getElementById('p-btn-prev').addEventListener('click', () => changePiratePage(-1));

document.getElementById('p-btn-next').addEventListener('click', () => changePiratePage(1));

export function setPirateCurrentPage(n) { pirateCurrentPage = n; }
