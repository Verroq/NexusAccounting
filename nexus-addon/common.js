// Shared state and helpers used by every dashboard tab.
// Loaded first — all other dashboard scripts depend on it.

let store = {};   // full storage snapshot

let activeTab = 'surveys';

const PER_PAGE = 20;

function fmt(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}

// ── Mode-aware data helpers ────────────────────────────────────────────────

function getMode() {
  return document.getElementById('mode-select').value; // 'all' | 'daily' | 'hourly'
}

// Number of trailing buckets (days or hours) the graph shows; 0 = all.
function getWindow() {
  const el = document.getElementById('window-select');
  return el ? (parseInt(el.value, 10) || 0) : 5;
}

// Selected security zone, or 'all'.
function getZone() {
  const el = document.getElementById('zone-select');
  return el ? el.value : 'all';
}

// Filter records to the selected zone (passthrough when 'all'). Records from
// before zones were tracked have no `zone` → treated as 'unknown'.
function filterZone(reports) {
  const z = getZone();
  if (z === 'all') return reports || [];
  return (reports || []).filter(r => (r.zone || 'unknown') === z);
}

// True when the precomputed all-time totals can be used as-is (no zone filter).
function isUnfiltered() {
  return getZone() === 'all';
}

function getLabelKey(mode) {
  return mode === 'hourly' ? 'hour' : 'day';
}

function periodLabelFor(mode) {
  return mode === 'all' ? '' : mode === 'daily' ? ' (latest day)' : ' (latest hour)';
}

// ── Shared per-tab helpers ─────────────────────────────────────────────────
// Every tab follows the same pattern: slice the latest day/hour out of its
// report history, optionally compute an hourly series, and draw the standard
// three-resource line chart. The per-tab code only supplies field getters.

// Latest day/hour slice of a report list for daily/hourly view modes.
function latestBucket(reports, mode) {
  const keyFn = r => mode === 'daily'
    ? r.created_at.slice(0, 10)
    : r.created_at.slice(0, 13) + ':00';
  if (!reports.length) return [];
  const latestKey = reports.reduce((best, r) => {
    const k = keyFn(r);
    return k > best ? k : best;
  }, '');
  return reports.filter(r => keyFn(r) === latestKey);
}

// Records to aggregate for the current mode + zone: zone-filtered all-time for
// 'all' mode, else the latest day/hour bucket of the zone-filtered records.
function recordsForMode(allRecords, mode) {
  const filtered = filterZone(allRecords || []);
  return mode === 'all' ? filtered : latestBucket(filtered, mode);
}

// Time series grouped by day (all/daily modes) or hour (hourly mode).
// fieldGetters: { field: r => value }.
function computeSeries(reports, mode, fieldGetters) {
  const byHour = mode === 'hourly';
  const keyName = byHour ? 'hour' : 'day';
  const fields = Object.keys(fieldGetters);
  const map = {};
  for (const r of reports) {
    const k = byHour ? r.created_at.slice(0, 13) + ':00' : r.created_at.slice(0, 10);
    if (!map[k]) {
      map[k] = { [keyName]: k };
      for (const f of fields) map[k][f] = 0;
    }
    for (const [f, get] of Object.entries(fieldGetters)) map[k][f] += get(r);
  }
  const keys = Object.keys(map).sort();
  if (keys.length < 2) return keys.map(k => map[k]);

  // Fill empty days/hours with zero rows so the time axis stays continuous —
  // otherwise the chart's equal-spaced labels misrepresent gaps in activity.
  const step = byHour ? 3600000 : 86400000;
  const toDate = k => new Date(byHour ? `${k}:00Z` : `${k}T00:00:00Z`);
  const fmt = d => byHour ? d.toISOString().slice(0, 13) + ':00' : d.toISOString().slice(0, 10);
  const blank = k => { const o = { [keyName]: k }; for (const f of fields) o[f] = 0; return o; };
  const out = [];
  const end = toDate(keys[keys.length - 1]).getTime();
  let t = toDate(keys[0]).getTime(), guard = 0;
  while (t <= end && guard++ < 100000) {
    const k = fmt(new Date(t));
    out.push(map[k] || blank(k));
    t += step;
  }
  const win = getWindow();
  return win > 0 ? out.slice(-win) : out;
}

// Hourly series from report history. fieldGetters: { field: r => value }.
function computeHourlySeries(reports, fieldGetters) {
  const map = {};
  for (const r of reports) {
    const hour = r.created_at.slice(0, 13) + ':00';
    if (!map[hour]) {
      map[hour] = { hour };
      for (const f of Object.keys(fieldGetters)) map[hour][f] = 0;
    }
    for (const [f, get] of Object.entries(fieldGetters)) map[hour][f] += get(r);
  }
  return Object.values(map).sort((a, b) => a.hour.localeCompare(b.hour));
}

const RESOURCE_SERIES = [
  { field: 'ore',          label: 'Ore',          color: '#f0883e' },
  { field: 'silicates',    label: 'Silicates',    color: '#56d364' },
  { field: 'hydrogen',     label: 'Hydrogen',     color: '#79c0ff' },
  { field: 'alloys',       label: 'Alloys',       color: '#e3b341' },
  { field: 'ice',          label: 'Ice',          color: '#a5d6ff' },
  { field: 'quantum_dust', label: 'Quantum Dust', color: '#bc8cff' },
  { field: 'plasma_core',  label: 'Plasma Core',  color: '#ff7b72' },
  { field: 'dark_matter',  label: 'Dark Matter',  color: '#d2a8ff' },
  { field: 'antimatter',   label: 'Antimatter',   color: '#ffa657' },
];

// fieldGetters covering every chartable resource, for computeSeries.
const SERIES_GETTERS = {};
for (const d of RESOURCE_SERIES) SERIES_GETTERS[d.field] = r => r[d.field] || 0;

// Resource line chart. Ore/silicates/hydrogen always shown; alloys + exotics
// only when the series actually carries some (avoids a wall of flat-zero lines).
// `count` = { field, label } adds a report-count line on a secondary y-axis.
function makeResourceLineChart(canvasId, series, labelKey, count) {
  const ALWAYS = new Set(['ore', 'silicates', 'hydrogen']);
  const shown = RESOURCE_SERIES.filter(d =>
    ALWAYS.has(d.field) || series.some(r => (r[d.field] || 0) > 0));
  const datasets = shown.map(d => ({
    label: d.label,
    data: series.map(r => r[d.field] || 0),
    borderColor: d.color,
    backgroundColor: d.color + '22',
    fill: true,
    tension: 0.3,
  }));
  const scales = { ...SCALE_OPTS };
  if (count) {
    datasets.push({
      label: count.label,
      data: series.map(r => r[count.field] || 0),
      borderColor: '#8b949e',
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      yAxisID: 'count',
    });
    scales.count = {
      position: 'right',
      beginAtZero: true,
      ticks: { color: '#8b949e', precision: 0 },
      grid: { drawOnChartArea: false },
    };
  }
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: series.map(r => r[labelKey]), datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales,
    },
  });
}

// ── Pure aggregation helpers ───────────────────────────────────────────────

function computeEventBreakdown(reports) {
  const map = {};
  for (const r of reports) {
    const et = r.event_type || 'unknown';
    if (!map[et]) map[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[et].count += 1;
    map[et].ore += r.ore || 0;
    map[et].hydrogen += r.hydrogen || 0;
    map[et].silicates += r.silicates || 0;
    for (const k of EXTRA_RES_KEYS_UI) map[et][k] = (map[et][k] || 0) + (r[k] || 0);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// A damaged ship costs half its build cost to repair.
const REPAIR_FACTOR = 0.5;

function emptyResources() {
  return { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
}

// Loss split into full-cost destruction and half-cost repair of damaged ships.
// Returns { destroyed, repair }, each an emptyResources()-shaped object.
function computeResourcesLost(reports, ships) {
  const out = { destroyed: emptyResources(), repair: emptyResources() };
  const add = (into, detail, factor) => {
    for (const [defId, qty] of Object.entries(detail || {})) {
      const ship = ships[defId];
      if (!ship) continue;
      const q = qty * factor;
      into.ore += q * (ship.costOre || 0);
      into.silicates += q * (ship.costSilicates || 0);
      into.hydrogen += q * (ship.costHydrogen || 0);
      into.alloys += q * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) {
        into.rare[k] = (into.rare[k] || 0) + q * v;
      }
    }
  };
  for (const r of reports) {
    add(out.destroyed, r.ships_lost_detail, 1);
    add(out.repair, r.ships_damaged_detail, REPAIR_FACTOR);
  }
  return out;
}

// Per-resource destroyed + repair, for net calculations.
function combinedLost(lost) {
  const d = lost.destroyed || {}, r = lost.repair || {};
  const out = emptyResources();
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) out[k] = (d[k] || 0) + (r[k] || 0);
  for (const src of [d.rare || {}, r.rare || {}]) {
    for (const [k, v] of Object.entries(src)) out.rare[k] = (out.rare[k] || 0) + v;
  }
  return out;
}

// ── Stat cards ─────────────────────────────────────────────────────────────

function makeStatCard(label, value, valueClass, valueStyle) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  if (valueStyle) valueDiv.style.cssText = valueStyle;
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

// ── Charts ─────────────────────────────────────────────────────────────────

const SCALE_OPTS = {
  x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
  y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
};

// ── Shared helpers for the newer tabs ──────────────────────────────────────

function zeroCell(v) {
  const td = document.createElement('td');
  if (v) {
    td.textContent = Number(v).toLocaleString();
  } else {
    const span = document.createElement('span');
    span.className = 'zero';
    span.textContent = '—';
    td.appendChild(span);
  }
  return td;
}

// Alloys + exotic resources, shown as their own collected cards. Values may be
// stored flat on totals or inside a `rare` map; read either.
const EXTRA_RESOURCES = [
  ['alloys', 'Alloys', 'alloys'],
  ['ice', 'Ice', 'hydrogen'],
  ['quantum_dust', 'Quantum Dust', 'rare'],
  ['plasma_core', 'Plasma Core', 'rare'],
  ['dark_matter', 'Dark Matter', 'rare'],
  ['antimatter', 'Antimatter', 'rare'],
];

const EXTRA_RES_KEYS_UI = EXTRA_RESOURCES.map(e => e[0]);

function resourceVal(totals, key) {
  if (totals && totals[key] != null) return totals[key];
  return (totals && totals.rare && totals.rare[key]) || 0;
}

// Append the alloys + exotic-resource cards (alloys always; rares only when
// some has been collected) to a collected-resources container.
function appendExtraResourceCards(container, totals, suffix) {
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    const v = resourceVal(totals, key);
    if (key === 'alloys' || v > 0) container.appendChild(makeStatCard(`${label}${suffix}`, fmt(v), cls));
  }
}

function appendRareCards(container, rare, suffix) {
  Object.entries(rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => container.appendChild(
      makeStatCard(`${k.replace(/_/g, ' ')}${suffix}`, fmt(v), 'rare')
    ));
}

function renderPagedTable(reports, page, infoId, prevId, nextId, tbodyId, rowFn) {
  const totalPages = Math.ceil(reports.length / PER_PAGE);
  const maxPage = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), maxPage);
  document.getElementById(infoId).textContent = `Page ${safePage} / ${maxPage} (${reports.length} total)`;
  document.getElementById(prevId).disabled = safePage <= 1;
  document.getElementById(nextId).disabled = safePage >= totalPages;
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const r of reports.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)) {
    tbody.appendChild(rowFn(r));
  }
}

// Fill a stats container with ore/silicates/hydrogen/alloys + rare cards.
function fillResourceCards(containerId, res, suffix) {
  const el = document.getElementById(containerId);
  if (!el) return;
  res = res || emptyResources();
  el.textContent = '';
  el.append(
    makeStatCard(`Ore${suffix}`, fmt(res.ore || 0), 'ore'),
    makeStatCard(`Silicates${suffix}`, fmt(res.silicates || 0), 'silicates'),
    makeStatCard(`Hydrogen${suffix}`, fmt(res.hydrogen || 0), 'hydrogen'),
    makeStatCard(`Alloys${suffix}`, fmt(res.alloys || 0), 'alloys'),
  );
  appendRareCards(el, res.rare, suffix);
}

// Renders a { destroyed, repair } loss into two separate titled containers.
// Pass repairId = null for tabs with no repair concept (debris, expeditions).
function renderLostCards(destroyedId, repairId, lost, periodLabel) {
  fillResourceCards(destroyedId, lost.destroyed, periodLabel);
  if (repairId) fillResourceCards(repairId, lost.repair, periodLabel);
}

// Relative value of each resource, used to weight the net total.
const RESOURCE_WEIGHTS = { ore: 1, silicates: 2, hydrogen: 3, alloys: 5 };
const RARE_WEIGHT = 10;   // exotic resources (ice, quantum dust, …) in the net total

// Net gain cards: resources collected minus ship build costs, per resource
// (raw), plus a weighted total (ore×1, silicates×2, hydrogen×3, alloys×5).
// Rare resource losses are not in the total (no common valuation).
function renderNetCards(containerId, collected, lost, periodLabel, fuelHydrogen = 0) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  const cost = combinedLost(lost);   // destruction + repair
  const fuel = fuelHydrogen || 0;
  const fields = [
    ['Ore', 'ore'], ['Silicates', 'silicates'], ['Hydrogen', 'hydrogen'], ['Alloys', 'alloys'],
  ];
  let total = 0;
  for (const [label, key] of fields) {
    let v = (collected[key] || 0) - (cost[key] || 0);
    if (key === 'hydrogen') v -= fuel;   // fuel is hydrogen burned on the trip
    total += v * RESOURCE_WEIGHTS[key];
    el.appendChild(makeStatCard(`${label} net${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), key));
  }
  // Exotic resources — net (collected − any rare ship-cost), weighted ×10 in
  // the total. Shown when present either side.
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    if (key === 'alloys') continue;   // already a core field above
    const got = resourceVal(collected, key);
    const spent = resourceVal(cost, key);
    if (!got && !spent) continue;
    const v = got - spent;
    total += v * RARE_WEIGHT;
    el.appendChild(makeStatCard(`${label} net${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), cls));
  }
  const totalCard = makeStatCard(`Total net${periodLabel}`, (total >= 0 ? '+' : '') + fmt(total),
    '', total >= 0 ? 'color:#56d364' : 'color:#ff7b72');
  totalCard.title = 'Weighted: ore×1, silicates×2, hydrogen×3, alloys×5, exotics×10.'
    + (fuel ? ` Includes ${fmt(fuel)} hydrogen fuel (est.).` : '');
  el.appendChild(totalCard);
}

// Doughnut of a loot/resource breakdown (ore, silicates, hydrogen, alloys and
// any rares) for the current view period. `totals` is a mode-aware totals
// object; returns the Chart instance.
const RESOURCE_COLORS = {
  ore: '#f0883e', silicates: '#56d364', hydrogen: '#79c0ff', alloys: '#e3b341',
};
const RARE_PALETTE = ['#bc8cff', '#d2a8ff', '#ff7b72', '#ffa657', '#a5d6ff', '#7ee787'];

function makeResourceDoughnut(canvasId, totals) {
  const entries = [];
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) {
    if (totals[k] > 0) entries.push([k, totals[k], RESOURCE_COLORS[k]]);
  }
  let ri = 0;
  for (const [k, v] of Object.entries(totals.rare || {})) {
    if (v > 0) entries.push([k.replace(/_/g, ' '), v, RARE_PALETTE[ri++ % RARE_PALETTE.length]]);
  }
  const total = entries.reduce((s, e) => s + e[1], 0);
  return new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      labels: entries.map(e => {
        const pct = total ? (e[1] / total * 100).toFixed(1) : 0;
        return `${e[0]} — ${Number(e[1]).toLocaleString()} (${pct}%)`;
      }),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: entries.map(e => e[2]) }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${Number(ctx.parsed).toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// Colored zone badge cell for report tables.
const ZONE_COLORS = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#d2a8ff', unknown: '#8b949e',
};
function zoneCell(zone) {
  const z = zone || 'unknown';
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = z;
  badge.style.color = ZONE_COLORS[z] || ZONE_COLORS.unknown;
  td.appendChild(badge);
  return td;
}

// ── Sortable tables ─────────────────────────────────────────────────────────
// Click a th.sortable[data-key] to sort; click again to flip. `state` is a
// plain { key, dir } object the caller keeps; `rerender` redraws the table.
function attachSortable(headId, state, rerender) {
  const head = document.getElementById(headId);
  if (!head) return;
  head.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    state.dir = state.key === th.dataset.key ? -state.dir : -1;
    state.key = th.dataset.key;
    rerender();
  });
}

// Sort a copy of records by the state, draw the header arrow, and return it.
function applySort(headId, records, state, tiebreak = 'created_at') {
  const { key, dir } = state;
  document.querySelectorAll(`#${headId} th.sortable`).forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = dir === -1 ? ' ▼' : ' ▲';
      th.appendChild(arrow);
    }
  });
  return records.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || String(b[tiebreak] ?? '').localeCompare(String(a[tiebreak] ?? ''));
  });
}
