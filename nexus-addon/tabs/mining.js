// Mining tab.

// ── Mining tab ─────────────────────────────────────────────────────────────

import { EXTRA_RES_KEYS_UI, RARE_WEIGHT, RESOURCE_WEIGHTS, SERIES_GETTERS, appendExtraResourceCards, applySort, attachSortable, combinedLost, computeResourcesLost, computeSeries, emptyResources, filterZone, fmt, fuelEstimate, fuelForMode, getLabelKey, getMode, isUnfiltered, makeResourceDoughnut, makeResourceLineChart, makeStatCard, periodLabelFor, recordsForMode, renderLostCards, renderNetCards, renderPagedTable, store, windowActive, zeroCell, zoneCell } from '../common.js';

// Weighted value (ore×1, silicates×2, hydrogen×3, alloys×5, exotics×10), matching
// the Net cards. Reads flat resource keys and an optional `rare` map.
const RARE_KEYS = ['cryo_ice', 'quantum_dust', 'plasma_core', 'dark_matter', 'antimatter', 'bio_extract'];
function weightedValue(res) {
  let v = (res.ore || 0) * RESOURCE_WEIGHTS.ore + (res.silicates || 0) * RESOURCE_WEIGHTS.silicates
        + (res.hydrogen || 0) * RESOURCE_WEIGHTS.hydrogen + (res.alloys || 0) * RESOURCE_WEIGHTS.alloys;
  for (const k of RARE_KEYS) v += (res[k] || 0) * RARE_WEIGHT;
  if (res.rare) for (const val of Object.values(res.rare)) v += (val || 0) * RARE_WEIGHT;
  return v;
}

// System name → id, from the galaxy map (cached). Used to resolve a mining
// report's target system for the fuel estimate.
let _sysMap = null;
async function systemNameToId() {
  if (_sysMap) return _sysMap;
  const map = await browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' });
  _sysMap = {};
  for (const s of (map.systems || [])) _sysMap[s.name] = s.id;
  return _sysMap;
}

// Add drill-breakdown maintenance (alloys) to the repair bucket, without
// mutating the source object. Net and the Repair card subtract this. The
// alloy cost is per-drill-type, computed at scrape time from the report's
// damaged drills (see background.js maintenanceAlloys).
function withDrillMaintenance(lost, alloys) {
  if (!alloys) return lost;
  const repair = { ...emptyResources(), ...(lost.repair || {}) };
  repair.alloys = (repair.alloys || 0) + alloys;
  return { ...lost, repair };
}

// Ship-cost losses for the current period. All-time + all-zones uses the
// precomputed valuation; otherwise it's re-valued from the period's reports
// (reports stored before ships_lost_detail was tracked value as 0).
function getMiningLostForMode(mode) {
  if (mode === 'all' && isUnfiltered() && !windowActive()) {
    const base = store.mining_resources_lost?.destroyed
      ? store.mining_resources_lost
      : { destroyed: emptyResources(), repair: emptyResources() };
    return withDrillMaintenance(base, store.mining_totals?.maintenance_alloys);
  }
  const records = recordsForMode(store.mining_recent_reports, mode);
  const alloys = records.reduce((s, r) => s + (r.maintenance_alloys || 0), 0);
  return withDrillMaintenance(computeResourcesLost(records, store.ships || {}), alloys);
}

export let chartMining, chartMiningLoot;

export let miningPage = 1;

export function getMiningTotalsForMode(mode) {
  if (mode === 'all' && isUnfiltered() && !windowActive()) {
    return store.mining_totals || {
      ...emptyResources(),
      deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0,
      stolen: emptyResources(),
    };
  }
  return recordsForMode(store.mining_recent_reports, mode).reduce((t, r) => ({
    ore: t.ore + (r.ore || 0),
    silicates: t.silicates + (r.silicates || 0),
    hydrogen: t.hydrogen + (r.hydrogen || 0),
    deliveries: t.deliveries + 1,
    cycles: t.cycles + (r.cycles || 0),
    drill_breakdowns: t.drill_breakdowns + (r.drill_breakdowns || 0),
    ships_lost: t.ships_lost + (r.ships_lost || 0),
    stolen_total: t.stolen_total + (r.stolen_total || 0),
    ...Object.fromEntries(EXTRA_RES_KEYS_UI.map(k => [k, (t[k] || 0) + (r[k] || 0)])),
  }), { ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0, stolen_total: 0 });
}

export function getMiningSeriesForMode(mode) {
  if (mode !== 'hourly' && isUnfiltered() && !windowActive()) return store.mining_daily || [];
  return computeSeries(filterZone(store.mining_recent_reports || []), mode,
    { ...SERIES_GETTERS, deliveries: () => 1 });
}

export function renderMiningTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
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
    appendExtraResourceCards(delivered, t, periodLabel);
  }

  const ops = document.getElementById('m-stats-ops');
  ops.textContent = '';
  const stolenTotal = (mode === 'all' && isUnfiltered() && !windowActive())
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
    makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('mining', getMode())), 'hydrogen'),
  );

  const rl = getMiningLostForMode(mode);
  renderLostCards('m-stats-lost', 'm-stats-repair', rl, periodLabel);

  // Net = delivered loot − ship-cost losses − fuel, for the current period.
  renderNetCards('m-stats-net', t, rl, periodLabel, fuelForMode('mining', getMode()));

  if (chartMiningLoot) chartMiningLoot.destroy();
  chartMiningLoot = makeResourceDoughnut('chart-mining-loot', t);

  if (chartMining) chartMining.destroy();
  chartMining = makeResourceLineChart('chart-mining', getMiningSeriesForMode(mode), getLabelKey(mode), { field: 'deliveries', label: 'Deliveries' });

  renderMiningTable();
}

export const miningSort = { key: 'created_at', dir: -1 };
attachSortable('m-reports-head', miningSort, () => { miningPage = 1; renderMiningTable(); });

export function renderMiningTable() {
  // Deliveries only — pirate_raid records are kept for the battles tab, not here.
  // Records predating report_type default to delivery.
  const deliveries = (store.mining_recent_reports || []).filter(r => (r.report_type || 'delivery') === 'delivery');
  const reports = applySort('m-reports-head', filterZone(deliveries), miningSort);
  const pending = [];   // rows whose Fuel/ROI cells fill asynchronously
  renderPagedTable(reports, miningPage, 'm-page-info', 'm-btn-prev', 'm-btn-next', 'm-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location;
    const tdOre = zeroCell(r.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(r.silicates); tdSil.className = 'silicates';
    const tdHyd = zeroCell(r.hydrogen); tdHyd.className = 'hydrogen';
    const tdAll = zeroCell(r.alloys); tdAll.className = 'alloys';
    const fuelCell = document.createElement('td'); fuelCell.textContent = '…'; fuelCell.className = 'hydrogen';
    const roiCell = document.createElement('td'); roiCell.textContent = '…';
    tr.append(tdDate, tdLoc, zoneCell(r.zone), tdOre, tdSil, tdHyd, tdAll,
              zeroCell(r.cryo_ice), zeroCell(r.quantum_dust), zeroCell(r.plasma_core),
              zeroCell(r.dark_matter), zeroCell(r.antimatter),
              zeroCell(r.cycles), zeroCell(r.drill_breakdowns),
              fuelCell, roiCell);
    pending.push({ r, fuelCell, roiCell });
    return tr;
  });
  fillFuelRoi(pending);
}

// Fill the Fuel cost + ROI columns. Fuel is the POST fuel-estimate for the stored
// fleet from its source planet to the mined system. ROI (weighted) =
// resources mined − breakdown maintenance − fuel − ship-loss cost − stolen.
// A generation guard discards a superseded render/page.
let roiGen = 0;
async function fillFuelRoi(rows) {
  const gen = ++roiGen;
  const ships = store.ships || {};
  const nameToId = await systemNameToId().catch(() => ({}));
  if (gen !== roiGen) return;
  for (const { r, fuelCell, roiCell } of rows) {
    if (gen !== roiGen) return;
    const mined = weightedValue(r);
    const breakdown = (r.maintenance_alloys || 0) * RESOURCE_WEIGHTS.alloys;
    const shipLoss = weightedValue(combinedLost(computeResourcesLost([r], ships)));
    const stolen = weightedValue(r.stolen || {});

    const sysId = nameToId[(r.location || '').split(' / ')[0].trim()];
    let fuel = null;
    if (r.source_planet_id && sysId && Array.isArray(r.fleet) && r.fleet.length) {
      const est = await fuelEstimate(r.source_planet_id, sysId, r.fleet);
      if (gen !== roiGen) return;
      if (!est.error && est.fuelCost != null) fuel = est.fuelCost;
    }
    fuelCell.textContent = fuel != null ? fmt(fuel) : '—';
    if (fuel == null) fuelCell.title = 'No fuel estimate (missing fleet/system, or no game tab open).';

    const roi = mined - breakdown - (fuel || 0) * RESOURCE_WEIGHTS.hydrogen - shipLoss - stolen;
    roiCell.textContent = (roi >= 0 ? '+' : '') + fmt(roi);
    roiCell.style.color = roi >= 0 ? '#56d364' : '#ff7b72';
    roiCell.title = fuel == null
      ? `Fuel excluded. mined ${fmt(mined)} − breakdown ${fmt(breakdown)} − ship loss ${fmt(shipLoss)} − stolen ${fmt(stolen)}`
      : `mined ${fmt(mined)} − breakdown ${fmt(breakdown)} − fuel ${fmt(fuel * RESOURCE_WEIGHTS.hydrogen)} − ship loss ${fmt(shipLoss)} − stolen ${fmt(stolen)}`;
  }
}

document.getElementById('m-btn-prev').addEventListener('click', () => { miningPage--; renderMiningTable(); });

document.getElementById('m-btn-next').addEventListener('click', () => { miningPage++; renderMiningTable(); });

export function setMiningPage(n) { miningPage = n; }
