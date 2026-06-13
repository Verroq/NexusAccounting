// Pirates tab.

let chartPirateLoot, chartPirateOutcomes;

let pirateCurrentPage = 1;

// ── Pirates tab ────────────────────────────────────────────────────────────

function getPirateTotalsForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered()) return store.pirate_totals || {};
  return recordsForMode(store.pirate_recent_reports, mode).reduce((t, r) => ({
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
  if (mode === 'all' && isUnfiltered()) return store.pirate_resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  return computeResourcesLost(recordsForMode(store.pirate_recent_reports, mode), store.ships || {});
}

function getPirateDebrisForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered()) return store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  return recordsForMode(store.pirate_recent_reports, mode).reduce((t, r) => ({
    ore: t.ore + (r.debris_ore || 0),
    alloys: t.alloys + (r.debris_alloys || 0),
    silicates: t.silicates + (r.debris_silicates || 0),
  }), { ore: 0, alloys: 0, silicates: 0 });
}

function getPirateOutcomesForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered()) return store.pirate_outcomes || [];
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

function getPirateSeriesForMode() {
  const mode = getMode();
  if (mode !== 'hourly' && isUnfiltered()) return store.pirate_daily || [];
  return computeSeries(filterZone(store.pirate_recent_reports || []), mode, {
    ore: r => r.ore || 0,
    hydrogen: r => r.hydrogen || 0,
    silicates: r => r.silicates || 0,
  });
}

function renderPiratesTab() {
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

  renderNetCards('p-stats-net', t, rl, periodLabel);

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
  if (chartPirateLoot) chartPirateLoot.destroy();
  chartPirateLoot = makeResourceLineChart('chart-pirate-loot', series, labelKey);
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
  const allReports = filterZone(store.pirate_recent_reports || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
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

    tr.append(tdDate, tdCamp, zoneCell(r.zone), tdOutcome, tdOre, tdHyd, tdSil,
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
