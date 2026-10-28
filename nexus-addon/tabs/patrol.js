// Patrol tab: system patrol reports (hunt/guard), same layout as the Mining
// tab. Every patrol record is kept (background.js processPatrolReports), so
// totals are summed from the records for every mode. Events and their types
// are stored on each record but not shown. Patrol reports carry no damaged
// ships, so there is no repair section.

import { SERIES_GETTERS, appendExtraResourceCards, applySort, attachSortable, computeResourcesLost, computeSeries, filterZone, fmt, fuelForMode, getLabelKey, getMode, makeResourceDoughnut, makeResourceLineChart, makeStatCard, periodLabelFor, recordsForMode, renderLostCards, renderNetCards, renderPagedTable, store, zeroCell, zoneCell } from '../common.js';

export let chartPatrol, chartPatrolLoot;
export let patrolPage = 1;
export function setPatrolPage(n) { patrolPage = n; }

// Finished patrols only: "Pirate Base Located" notices are not patrols.
export const patrolRecords = () => (store.patrol_recent_reports || []).filter(r => r.kind !== 'discovery');

// Flat resource totals + patrol count (also used by the Global tab).
export function getPatrolTotals(records) {
  const t = { ore: 0, silicates: 0, hydrogen: 0, patrols: 0 };
  for (const r of records) {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'number' && RES_KEYS.has(k)) t[k] = (t[k] || 0) + v;
    }
    t.patrols += 1;
  }
  return t;
}
const RES_KEYS = new Set(['ore', 'silicates', 'hydrogen', 'alloys', 'cryo_ice', 'quantum_dust', 'plasma_core', 'dark_matter', 'antimatter', 'bio_extract', 'precursor_fragments', 'artifact']);

export function renderPatrolTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const records = recordsForMode(patrolRecords(), mode);
  const t = getPatrolTotals(records);

  const loot = document.getElementById('pt-stats-loot');
  loot.textContent = '';
  if (!patrolRecords().length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No patrol reports recorded yet.';
    loot.appendChild(p);
  } else {
    loot.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
    );
    appendExtraResourceCards(loot, t, periodLabel);
  }

  const fuel = fuelForMode('patrol', mode);
  const ops = document.getElementById('pt-stats-ops');
  ops.textContent = '';
  ops.append(
    makeStatCard(`Patrols${periodLabel}`, fmt(t.patrols), 'missions'),
    makeStatCard(`Fuel spent${periodLabel}`, fmt(fuel), 'hydrogen'),
  );

  const lost = computeResourcesLost(records, store.ships || {});
  renderLostCards('pt-stats-lost', null, lost, periodLabel);
  renderNetCards('pt-stats-net', t, lost, periodLabel, fuel);

  if (chartPatrolLoot) chartPatrolLoot.destroy();
  chartPatrolLoot = makeResourceDoughnut('chart-patrol-loot', t);
  if (chartPatrol) chartPatrol.destroy();
  chartPatrol = makeResourceLineChart('chart-patrol',
    computeSeries(filterZone(patrolRecords()), mode, { ...SERIES_GETTERS, patrols: () => 1 }),
    getLabelKey(mode), { field: 'patrols', label: 'Patrols' });

  renderPatrolTable();
}

export const patrolSort = { key: 'created_at', dir: -1 };
attachSortable('pt-reports-head', patrolSort, () => { patrolPage = 1; renderPatrolTable(); });

export function renderPatrolTable() {
  const reports = applySort('pt-reports-head', filterZone(patrolRecords()), patrolSort);
  renderPagedTable(reports, patrolPage, 'pt-page-info', 'pt-btn-prev', 'pt-btn-next', 'pt-reports-tbody', r => {
    const tr = document.createElement('tr');
    const td = text => { const c = document.createElement('td'); c.textContent = text; return c; };
    const res = (v, cls) => { const c = zeroCell(v); c.className = cls; return c; };
    tr.append(td(new Date(r.created_at).toLocaleString()), td(r.mode || '—'), zoneCell(r.zone),
      td(`${+(r.duration_h || 0).toFixed(1)} h`),
      res(r.ore, 'ore'), res(r.silicates, 'silicates'), res(r.hydrogen, 'hydrogen'), res(r.alloys, 'alloys'),
      zeroCell(r.cryo_ice), zeroCell(r.quantum_dust), zeroCell(r.plasma_core),
      zeroCell(r.dark_matter), zeroCell(r.antimatter));
    return tr;
  });
}

document.getElementById('pt-btn-prev').addEventListener('click', () => { patrolPage--; renderPatrolTable(); });
document.getElementById('pt-btn-next').addEventListener('click', () => { patrolPage++; renderPatrolTable(); });
