// Surveys tab.

let chartResources, chartEvents, chartByEvent;

let currentPage = 1;

// Survey-only event-type filter (combines with the global zone + view).
function getSurveyEvent() {
  const el = document.getElementById('event-select');
  return el ? el.value : 'all';
}
function filterEvent(reports) {
  const e = getSurveyEvent();
  return e === 'all' ? reports : (reports || []).filter(r => (r.event_type || 'unknown') === e);
}
// No filter active → precomputed all-time totals can be used.
function surveyUnfiltered() {
  return isUnfiltered() && getSurveyEvent() === 'all';
}
// Records for the current view, zone and event filters.
function surveyRecordsForMode(mode) {
  const filtered = filterEvent(filterZone(store.recent_reports || []));
  return mode === 'all' ? filtered : latestBucket(filtered, mode);
}

// Returns {ore, hydrogen, silicates, missions, ships_lost} for the current view.
function getTotalsForMode() {
  const mode = getMode();
  if (mode === 'all' && surveyUnfiltered()) return store.totals || {};
  return surveyRecordsForMode(mode).reduce((t, r) => {
    t.ore += r.ore || 0; t.hydrogen += r.hydrogen || 0; t.silicates += r.silicates || 0;
    t.missions += 1; t.ships_lost += r.ships_lost || 0;
    for (const k of EXTRA_RES_KEYS_UI) t[k] = (t[k] || 0) + (r[k] || 0);
    return t;
  }, { ore: 0, hydrogen: 0, silicates: 0, missions: 0, ships_lost: 0 });
}

// Returns resources-lost for the current view.
function getResourcesLostForMode() {
  const mode = getMode();
  if (mode === 'all' && surveyUnfiltered()) return store.resources_lost || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  return computeResourcesLost(surveyRecordsForMode(mode), store.ships || {});
}

// Event-type breakdown — zone-aware but NOT event-filtered (it is the selector
// context, so it always shows the full distribution).
function getEventBreakdownForMode() {
  const mode = getMode();
  if (mode === 'all' && isUnfiltered()) return store.event_breakdown || [];
  return computeEventBreakdown(recordsForMode(store.recent_reports, mode));
}

// Returns time-series data array for the resources-over-time chart.
function getSeriesForMode() {
  const mode = getMode();
  if (mode !== 'hourly' && surveyUnfiltered()) return store.daily || [];
  return computeSeries(filterEvent(filterZone(store.recent_reports || [])), mode,
    { ...SERIES_GETTERS, missions: () => 1 });
}

// Populate the event dropdown from the event types present, preserving the
// current selection.
function populateEventOptions() {
  const sel = document.getElementById('event-select');
  if (!sel) return;
  const types = (store.event_breakdown || []).map(e => e.event_type).filter(Boolean).sort();
  const current = sel.value;
  sel.textContent = '';
  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = 'All events';
  sel.appendChild(optAll);
  for (const t of types) {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t.replace(/_/g, ' ');
    sel.appendChild(o);
  }
  sel.value = types.includes(current) || current === 'all' ? current : 'all';
}

function renderCollected(t, periodLabel) {
  const container = document.getElementById('stats-collected');
  container.textContent = '';
  const noData = !store.totals || !store.totals.missions;
  if (noData) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No data yet — log in to ';
    const a = document.createElement('a');
    a.href = 'https://s0.nexuslegacy.space';
    a.target = '_blank';
    a.style.color = '#58a6ff';
    a.textContent = 'Nexus Legacy';
    p.append(a, document.createTextNode(' then click Scrape Now.'));
    container.appendChild(p);
    return;
  }
  container.append(
    makeStatCard(`Ore${periodLabel}`,        fmt(t.ore),        'ore'),
    makeStatCard(`Silicates${periodLabel}`,  fmt(t.silicates),  'silicates'),
    makeStatCard(`Hydrogen${periodLabel}`,   fmt(t.hydrogen),   'hydrogen'),
  );
  appendExtraResourceCards(container, t, periodLabel);
  container.append(
    makeStatCard(`Missions${periodLabel}`,   fmt(t.missions),   'missions'),
    makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
    makeStatCard(`Fuel spent${periodLabel}`, fmt(fuelForMode('survey', getMode())), 'hydrogen'),
  );
}

function renderLost(rl, periodLabel) {
  renderLostCards('stats-lost', 'stats-repair', rl, periodLabel);
}

function renderResourceChart(series, labelKey) {
  if (chartResources) chartResources.destroy();
  chartResources = makeResourceLineChart('chart-resources', series, labelKey, { field: 'missions', label: 'Missions' });
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
  const filtered = events.filter(e => RESOURCE_SERIES.some(d => (e[d.field] || 0) > 0));
  const labels = filtered.map(e => e.event_type.replace(/_/g, ' '));
  const ALWAYS = new Set(['ore', 'silicates', 'hydrogen']);
  const shown = RESOURCE_SERIES.filter(d =>
    ALWAYS.has(d.field) || filtered.some(e => (e[d.field] || 0) > 0));
  if (chartByEvent) chartByEvent.destroy();
  chartByEvent = new Chart(document.getElementById('chart-by-event'), {
    type: 'bar',
    data: {
      labels,
      datasets: shown.map(d => ({
        label: d.label,
        data: filtered.map(e => e[d.field] || 0),
        backgroundColor: d.color + 'cc',
      })),
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: SCALE_OPTS,
    },
  });
}

// ── Reports table ──────────────────────────────────────────────────────────

let surveySort = { key: 'created_at', dir: -1 };

document.getElementById('reports-head').addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const key = th.dataset.key;
  surveySort = { key, dir: surveySort.key === key ? -surveySort.dir : -1 };
  currentPage = 1;
  renderTable();
});

function renderTable() {
  const { key, dir } = surveySort;
  const allReports = filterEvent(filterZone(store.recent_reports || [])).slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || b.created_at.localeCompare(a.created_at);
  });

  // Header arrows
  document.querySelectorAll('#reports-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = dir === -1 ? ' ▼' : ' ▲';
      th.appendChild(arrow);
    }
  });

  const totalPages = Math.ceil(allReports.length / PER_PAGE);
  document.getElementById('page-info').textContent = `Page ${currentPage} / ${Math.max(1, totalPages)} (${allReports.length} total)`;
  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= totalPages;

  const slice = allReports.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const tbody = document.getElementById('reports-tbody');
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

    const tdSys = document.createElement('td');
    tdSys.textContent = r.system_name || '—';

    const tdEvt = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${r.event_type}`;
    badge.textContent = r.event_type.replace(/_/g, ' ');
    tdEvt.appendChild(badge);

    const tdOre = zeroTd(r.ore);       tdOre.className = 'ore';
    const tdHyd = zeroTd(r.hydrogen);  tdHyd.className = 'hydrogen';
    const tdSil = zeroTd(r.silicates); tdSil.className = 'silicates';
    const tdAll = zeroTd(r.alloys);    tdAll.className = 'alloys';

    tr.append(tdDate, tdSys, zoneCell(r.zone), tdEvt, tdOre, tdHyd, tdSil, tdAll,
              zeroTd(r.ice), zeroTd(r.quantum_dust), zeroTd(r.plasma_core),
              zeroTd(r.dark_matter), zeroTd(r.antimatter),
              zeroTd(r.ships_lost), zeroTd(r.ships_damaged));
    tbody.appendChild(tr);
  }
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
}

document.getElementById('btn-prev').addEventListener('click', () => changePage(-1));

document.getElementById('btn-next').addEventListener('click', () => changePage(1));
