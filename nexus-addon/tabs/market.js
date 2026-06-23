// Market tab: every open market offer, filterable by hub and by the resource
// you want to buy (offered) / sell (paid), sortable by exchange ratio.
//
// To take any order you give its requestResource and receive its offerResource,
// so "buy" filters on offerResource and "sell" on requestResource. Ratio is
// received-per-given (offerAmount / requestAmount) — higher is a better deal.

import { applySort, attachSortable, fmt } from '../common.js';

const ICON_BASE = 'https://s0.nexuslegacy.space/images/resources/';
// All tradable resources, always shown as filter icons (basic first, then exotic).
const RESOURCES = ['ore', 'silicates', 'hydrogen', 'alloys', 'cryo_ice',
  'quantum_dust', 'plasma_core', 'bio_extract', 'dark_matter', 'antimatter'];
// Per-resource colours for the Offering / For amounts in the table.
const RES_COLOR = {
  ore: '#f0883e', silicates: '#56d364', hydrogen: '#79c0ff', alloys: '#e3b341',
  cryo_ice: '#a5d6ff', quantum_dust: '#d2a8ff', plasma_core: '#ff7b72',
  bio_extract: '#7ee787', dark_matter: '#bc8cff', antimatter: '#ffa657',
};
// Mean ratio after dropping the worst 5% (lowball listings nobody trades), so
// the baseline reflects the real market rather than junk orders.
const trimmedMean = nums => {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const kept = s.slice(Math.floor(s.length * 0.05));   // cut the lowest 5% of ratios
  return kept.reduce((a, b) => a + b, 0) / kept.length;
};

// Baseline exchange ratio per offer→request pair, across all current-market
// orders. A row is judged good/bad by how its ratio compares to its baseline.
function pairBaselines(list) {
  const groups = {};
  for (const o of list) {
    const k = `${o.offerResource}>${o.requestResource}`;
    (groups[k] = groups[k] || []).push(o.ratio);
  }
  const base = {};
  for (const k in groups) base[k] = trimmedMean(groups[k]);
  return base;
}

let inited = false;
let orders = [];
let buyFilter = new Set(), sellFilter = new Set();   // empty = any; multi-select
let hubList = [];          // { name, x, y } for the mini-map
let galaxySystems = [];    // faint backdrop dots
let ownedSystems = new Set();   // system ids where you own a planet (drawn green)
let allianceMembers = new Set();   // userIds of your alliance — seller shown green
let mapHits = [];               // { px, py, r, label, hub } for hover/click on the mini-map
export const marketSort = { key: 'rate', dir: 1 };   // cheapest cost-per-unit first

const res = s => String(s || '').replace(/_/g, ' ');

let source = 'market';   // 'market' | 'alliance'

attachSortable('m-head', marketSort, () => renderMarket());
document.getElementById('m-hub').addEventListener('change', () => { drawMap(); renderMarket(); });
document.getElementById('m-refresh').addEventListener('click', () => loadOrders());
document.getElementById('m-clear').addEventListener('click', () => {
  buyFilter.clear(); sellFilter.clear();
  document.getElementById('m-hub').value = '';
  drawIcons('m-buy'); drawIcons('m-sell');
  drawMap(); renderMarket();
});
document.getElementById('m-source').addEventListener('change', e => {
  source = e.target.checked ? 'alliance' : 'market';
  loadOrders();
});

export async function initMarketTab() {
  if (inited) return;
  inited = true;
  // One-time context, reused across both sources: your planets + galaxy backdrop.
  browser.runtime.sendMessage({ type: 'GET_HOME' }).then(home => {
    ownedSystems = new Set((home && !home.error && home.ownedSystemIds) || []);
    drawMap();
  });
  browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' }).then(map => {
    if (map && !map.error) { galaxySystems = map.systems || []; drawMap(); }
  });
  browser.runtime.sendMessage({ type: 'GET_ALLIANCE' }).then(a => {
    allianceMembers = new Set((a && !a.error && a.memberIds) || []);
    renderMarket();
  });
  loadOrders();
}

async function loadOrders() {
  const alliance = source === 'alliance';
  const status = document.getElementById('m-progress');
  status.textContent = `Loading ${alliance ? 'alliance trade' : 'market'} orders…`;
  document.getElementById('m-hub-label').textContent = alliance ? 'System:' : 'Trade Hub:';
  document.getElementById('m-hub-col').textContent = alliance ? 'System' : 'Hub';

  const toOrder = (o, hub) => ({
    ...o, hub,
    ratio: o.requestAmount ? o.offerAmount / o.requestAmount : 0,
    rate: o.offerAmount ? o.requestAmount / o.offerAmount : 0,   // requested per 1 offered
  });

  if (alliance) {
    const data = await browser.runtime.sendMessage({ type: 'GET_ALLIANCE_ORDERS' });
    if (data.error) { status.textContent = `Error: ${data.error}`; return; }
    orders = (data.orders || []).map(o => toOrder(o, o.systemName || `#${o.id}`));
    // Diamonds = distinct order systems (each order carries its own coords).
    const seen = {};
    hubList = [];
    for (const o of (data.orders || [])) {
      if (o.systemName && o.systemX != null && !seen[o.systemName]) {
        seen[o.systemName] = 1;
        hubList.push({ name: o.systemName, x: o.systemX, y: o.systemY });
      }
    }
  } else {
    const [data, hubs] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_MARKET_ORDERS' }),
      browser.runtime.sendMessage({ type: 'GET_HUBS' }),
    ]);
    if (data.error) { status.textContent = `Error: ${data.error}`; return; }
    const hubNames = {};
    for (const h of (hubs?.hubs || [])) hubNames[h.id] = h.name;
    hubList = (hubs?.hubs || [])
      .filter(h => h.systemX != null && h.systemY != null)
      .map(h => ({ name: h.name, x: h.systemX, y: h.systemY }));
    orders = (data.orders || []).map(o => toOrder(o, hubNames[o.hubId] || `Hub ${o.hubId}`));
  }

  buyFilter.clear(); sellFilter.clear();
  drawIcons('m-buy');
  drawIcons('m-sell');
  fillSelect('m-hub', orders.map(o => o.hub));
  document.getElementById('m-hub').value = '';
  status.textContent = `${orders.length} open orders.`;
  renderMarket();
  drawMap();
}

// Mini galaxy view: faint system dots, hub diamonds, selected hub highlighted.
function drawMap() {
  const canvas = document.getElementById('m-map');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pts = galaxySystems.length ? galaxySystems : hubList;
  if (!pts.length) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of pts) {
    if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
  }
  const pad = 10;
  const sx = x => pad + (x - minX) / (maxX - minX || 1) * (canvas.width - 2 * pad);
  const sy = y => pad + (y - minY) / (maxY - minY || 1) * (canvas.height - 2 * pad);

  mapHits = [];
  ctx.fillStyle = '#21262d';
  for (const s of galaxySystems) {
    if (!ownedSystems.has(s.id)) ctx.fillRect(sx(s.x), sy(s.y), 1, 1);
  }
  // Your planets on top of the grey dots, in green.
  ctx.fillStyle = '#7ee787';
  for (const s of galaxySystems) {
    if (ownedSystems.has(s.id)) {
      const px = sx(s.x), py = sy(s.y);
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      mapHits.push({ px, py, r: 5, label: s.name || `System #${s.id}` });
    }
  }

  const sel = document.getElementById('m-hub').value;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const h of hubList) {
    const px = sx(h.x), py = sy(h.y), d = 4;
    const on = h.name === sel;
    ctx.fillStyle = on ? '#f5d90a' : '#8a7400';
    ctx.beginPath();
    ctx.moveTo(px, py - d); ctx.lineTo(px + d, py);
    ctx.lineTo(px, py + d); ctx.lineTo(px - d, py); ctx.closePath();
    ctx.fill();
    if (on) {
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(h.name, px, py - 11);
    }
    mapHits.push({ px, py, r: 7, label: h.name, hub: h.name });
  }
}

// canvas-space cursor coords (account for any CSS scaling)
function mapCursor(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    rect,
  };
}

// Nearest hit within its radius (hubs take priority — pushed last, checked first).
function hitAt(x, y) {
  for (let i = mapHits.length - 1; i >= 0; i--) {
    const h = mapHits[i];
    if (Math.hypot(h.px - x, h.py - y) <= h.r) return h;
  }
  return null;
}

document.getElementById('m-map').addEventListener('mousemove', e => {
  const canvas = e.currentTarget;
  const { x, y, rect } = mapCursor(canvas, e);
  const hit = hitAt(x, y);
  const tip = document.getElementById('m-tooltip');
  if (hit) {
    tip.textContent = hit.label;
    tip.style.display = '';
    tip.style.left = `${(e.clientX - rect.left) + 12}px`;
    tip.style.top = `${(e.clientY - rect.top) + 12}px`;
    canvas.style.cursor = hit.hub ? 'pointer' : 'default';
  } else {
    tip.style.display = 'none';
    canvas.style.cursor = 'default';
  }
});

document.getElementById('m-map').addEventListener('mouseleave', () => {
  document.getElementById('m-tooltip').style.display = 'none';
});

document.getElementById('m-map').addEventListener('click', e => {
  const { x, y } = mapCursor(e.currentTarget, e);
  const hit = hitAt(x, y);
  if (!hit || !hit.hub) return;
  const sel = document.getElementById('m-hub');
  sel.value = sel.value === hit.hub ? '' : hit.hub;   // click selected hub again to clear
  drawMap();
  renderMarket();
});

// Clickable resource-icon toggles. Click an icon to filter by it, click the
// selected one again to clear. Broken image URLs fall back to the alt text.
function drawIcons(id) {
  const box = document.getElementById(id);
  box.textContent = '';
  const set = id === 'm-buy' ? buyFilter : sellFilter;
  for (const v of RESOURCES) {
    const img = document.createElement('img');
    img.className = 'res-icon' + (set.has(v) ? ' sel' : '');
    img.src = `${ICON_BASE}${v}.webp`;
    img.alt = res(v);
    img.title = res(v);
    img.addEventListener('click', () => {
      if (set.has(v)) set.delete(v); else set.add(v);
      drawIcons(id);
      renderMarket();
    });
    box.appendChild(img);
  }
}

function fillSelect(id, values) {
  const sel = document.getElementById(id);
  const cur = sel.value;
  sel.textContent = '';
  const any = document.createElement('option');
  any.value = ''; any.textContent = 'any';
  sel.appendChild(any);
  for (const v of [...new Set(values)].sort()) {
    const o = document.createElement('option');
    o.value = v; o.textContent = res(v);
    sel.appendChild(o);
  }
  sel.value = cur;
}

export function renderMarket() {
  const hub = document.getElementById('m-hub').value;
  const rows = applySort('m-head', orders.filter(o =>
    (!buyFilter.size || buyFilter.has(o.offerResource)) &&
    (!sellFilter.size || sellFilter.has(o.requestResource)) &&
    (!hub || o.hub === hub)), marketSort, 'id');

  const tbody = document.getElementById('m-tbody');
  tbody.textContent = '';
  document.getElementById('m-count').textContent = `${rows.length} orders`;
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6; td.style.color = '#484f58';
    td.textContent = orders.length ? 'No orders match these filters.' : 'No open orders.';
    tr.appendChild(td); tbody.appendChild(tr);
    return;
  }
  const med = pairBaselines(orders);
  for (const o of rows) {
    const tr = document.createElement('tr');
    const n = o.rate >= 100 ? Math.round(o.rate) : Math.round(o.rate * 100) / 100;
    const cells = [
      o.hub, o.username,
      `${fmt(o.offerRemaining ?? o.offerAmount)} ${res(o.offerResource)}`,
      `${fmt(o.requestAmount)} ${res(o.requestResource)}`,
      `1 ${res(o.offerResource)} for ${n.toLocaleString()} ${res(o.requestResource)}`,
      o.ratio.toFixed(3),
    ];
    const colColor = { 2: RES_COLOR[o.offerResource], 3: RES_COLOR[o.requestResource], 5: '#e3b341' };
    if (allianceMembers.has(o.userId)) colColor[1] = '#7ee787';   // alliance seller

    // Tint by deal quality vs the market: this ratio ÷ the pair's baseline ratio
    // (trimmed mean). Above baseline = better-than-typical deal (green), below = red.
    const m = med[`${o.offerResource}>${o.requestResource}`];
    if (m && o.ratio) {
      const score = o.ratio / m;
      if (score > 1) tr.style.background = `rgba(88,130,96,${0.2 + 0.5 * Math.min(1, score - 1)})`;
      else if (score < 1) tr.style.background = `rgba(150,96,94,${0.2 + 0.5 * Math.min(1, 1 - score)})`;
    }
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (colColor[i]) td.style.color = colColor[i];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}
