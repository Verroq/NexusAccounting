// Mining tab.

// ── Mining tab ─────────────────────────────────────────────────────────────

let chartMining;

let miningPage = 1;

function getMiningTotalsForMode(mode) {
  if (mode === 'all' && isUnfiltered()) {
    return store.mining_totals || {
      ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {},
      deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0,
      stolen: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} },
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
    fuel: t.fuel + (r.fuel_est || 0),
    ...Object.fromEntries(EXTRA_RES_KEYS_UI.map(k => [k, (t[k] || 0) + (r[k] || 0)])),
  }), { ore: 0, silicates: 0, hydrogen: 0, deliveries: 0, cycles: 0, drill_breakdowns: 0, ships_lost: 0, stolen_total: 0, fuel: 0 });
}

function getMiningSeriesForMode(mode) {
  if (mode !== 'hourly' && isUnfiltered()) return store.mining_daily || [];
  return computeSeries(filterZone(store.mining_recent_reports || []), mode,
    { ...SERIES_GETTERS, deliveries: () => 1 });
}

function renderMiningTab() {
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
  const stolenTotal = (mode === 'all' && isUnfiltered())
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

  const rl = store.mining_resources_lost?.destroyed
    ? store.mining_resources_lost
    : { destroyed: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} }, repair: { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} } };
  renderLostCards('m-stats-lost', 'm-stats-repair', rl, '');

  // Net needs the loss valuation, which only exists in unfiltered all-time.
  const netVisible = mode === 'all' && isUnfiltered();
  document.getElementById('m-net-label').style.display = netVisible ? '' : 'none';
  document.getElementById('m-stats-net').style.display = netVisible ? '' : 'none';
  if (netVisible) renderNetCards('m-stats-net', t, rl, '', t.fuel || 0);

  if (chartMining) chartMining.destroy();
  chartMining = makeResourceLineChart('chart-mining', getMiningSeriesForMode(mode), getLabelKey(mode), { field: 'deliveries', label: 'Deliveries' });

  renderMiningTable();
}

const miningSort = { key: 'created_at', dir: -1 };
attachSortable('m-reports-head', miningSort, () => { miningPage = 1; renderMiningTable(); });

function renderMiningTable() {
  const reports = applySort('m-reports-head', filterZone(store.mining_recent_reports || []), miningSort);
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
    tr.append(tdDate, tdLoc, zoneCell(r.zone), tdOre, tdSil, tdHyd, tdAll,
              zeroCell(r.ice), zeroCell(r.quantum_dust), zeroCell(r.plasma_core),
              zeroCell(r.dark_matter), zeroCell(r.antimatter),
              zeroCell(r.cycles), zeroCell(r.drill_breakdowns),
              zeroCell(r.ships_lost), zeroCell(r.stolen_total));
    return tr;
  });
}

document.getElementById('m-btn-prev').addEventListener('click', () => { miningPage--; renderMiningTable(); });

document.getElementById('m-btn-next').addEventListener('click', () => { miningPage++; renderMiningTable(); });
