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
let allianceMembers = new Set();   // userIds of your alliance — seller shown green
export const marketSort = { key: 'rate', dir: 1 };   // cheapest cost-per-unit first

const res = s => String(s || '').replace(/_/g, ' ');

let source = 'market';   // 'market' | 'alliance'

attachSortable('m-head', marketSort, () => renderMarket());
document.getElementById('m-refresh').addEventListener('click', () => loadOrders());
document.getElementById('m-clear').addEventListener('click', () => {
  buyFilter.clear(); sellFilter.clear();
  document.getElementById('m-ratio-wanted').value = '';
  drawIcons('m-buy'); drawIcons('m-sell');
  renderMarket();
});
document.getElementById('m-ratio-wanted').addEventListener('input', () => renderMarket());
document.getElementById('m-source').addEventListener('change', e => {
  source = e.target.checked ? 'alliance' : 'market';
  loadOrders();
});

export async function initMarketTab() {
  if (inited) return;
  inited = true;
  // Alliance membership colours alliance sellers green; reused across sources.
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
  } else {
    const [data, hubs] = await Promise.all([
      browser.runtime.sendMessage({ type: 'GET_MARKET_ORDERS' }),
      browser.runtime.sendMessage({ type: 'GET_HUBS' }),
    ]);
    if (data.error) { status.textContent = `Error: ${data.error}`; return; }
    const hubNames = {};
    for (const h of (hubs?.hubs || [])) hubNames[h.id] = h.name;
    orders = (data.orders || []).map(o => toOrder(o, hubNames[o.hubId] || `Hub ${o.hubId}`));
  }

  buyFilter.clear(); sellFilter.clear();
  drawIcons('m-buy');
  drawIcons('m-sell');
  status.textContent = `${orders.length} open orders.`;
  renderMarket();
}

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

export function renderMarket() {
  const ratioWanted = parseFloat(document.getElementById('m-ratio-wanted').value);
  const rows = applySort('m-head', orders.filter(o =>
    (!buyFilter.size || buyFilter.has(o.offerResource)) &&
    (!sellFilter.size || sellFilter.has(o.requestResource)) &&
    (isNaN(ratioWanted) || o.ratio >= ratioWanted)), marketSort, 'id');

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
