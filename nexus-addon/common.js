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
  { field: 'ore',       label: 'Ore',       color: '#f0883e' },
  { field: 'silicates', label: 'Silicates', color: '#56d364' },
  { field: 'hydrogen',  label: 'Hydrogen',  color: '#79c0ff' },
];

// Standard ore/silicates/hydrogen line chart. Returns the Chart instance.
function makeResourceLineChart(canvasId, series, labelKey) {
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: {
      labels: series.map(r => r[labelKey]),
      datasets: RESOURCE_SERIES.map(d => ({
        label: d.label,
        data: series.map(r => r[d.field] || 0),
        borderColor: d.color,
        backgroundColor: d.color + '22',
        fill: true,
        tension: 0.3,
      })),
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: SCALE_OPTS,
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
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// A damaged ship costs half its build cost to repair.
const REPAIR_FACTOR = 0.5;

function computeResourcesLost(reports, ships) {
  const rl = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
  const add = (detail, factor) => {
    for (const [defId, qty] of Object.entries(detail || {})) {
      const ship = ships[defId];
      if (!ship) continue;
      const q = qty * factor;
      rl.ore += q * (ship.costOre || 0);
      rl.silicates += q * (ship.costSilicates || 0);
      rl.hydrogen += q * (ship.costHydrogen || 0);
      rl.alloys += q * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) {
        rl.rare[k] = (rl.rare[k] || 0) + q * v;
      }
    }
  };
  for (const r of reports) {
    add(r.ships_lost_detail, 1);
    add(r.ships_damaged_detail, REPAIR_FACTOR);
  }
  return rl;
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

// Net gain cards: resources collected minus ship build costs, per resource
// plus a 1:1 summed total. Rare resource losses are not in the total (they
// have no common valuation) — the tooltip says so.
function renderNetCards(containerId, collected, lost, periodLabel) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  const fields = [
    ['Ore', (collected.ore || 0) - (lost.ore || 0), 'ore'],
    ['Silicates', (collected.silicates || 0) - (lost.silicates || 0), 'silicates'],
    ['Hydrogen', (collected.hydrogen || 0) - (lost.hydrogen || 0), 'hydrogen'],
    ['Alloys', (collected.alloys || 0) - (lost.alloys || 0), 'alloys'],
  ];
  let total = 0;
  for (const [label, v, cls] of fields) {
    total += v;
    el.appendChild(makeStatCard(`${label} net${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), cls));
  }
  const totalCard = makeStatCard(`Total net${periodLabel}`, (total >= 0 ? '+' : '') + fmt(total),
    '', total >= 0 ? 'color:#56d364' : 'color:#ff7b72');
  totalCard.title = 'Sum of ore, silicates, hydrogen and alloys at 1:1. Rare resource losses not included.';
  el.appendChild(totalCard);
}
