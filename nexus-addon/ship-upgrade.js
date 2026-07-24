// Injects a "🚀 build" button onto every ship card (.entity-image holding a
// /api/images/ships/…webp image) on the game shipyard page. Clicking opens a
// planner: pick a quantity to build and it computes the total ore/silicates/
// hydrogen/alloys/rare cost — then hands the deficit to the Quartermaster to
// send from another planet.
//
// Cost model: flat per-unit (no level scaling, unlike buildings/tech) — ship
// def fields costOre/costSilicates/costHydrogen/costAlloys + rareCosts, the
// same shape buildShipCatalog() in background.js stores. qty × unit cost.
//
// Ships are per-planet like buildings (built at the shipyard of the planet in
// view, funded by that planet's stock) — reuses building-upgrade.js's "planet
// in view" pattern rather than tech's destination picker.
//
// IIFE + re-run guard: Firefox can inject a content script twice into one
// isolated world; top-level consts would then throw "redeclaration of const".
if (!window.__nxShipUpgrade) {
window.__nxShipUpgrade = true;
(function () {
const IMG = '/images/resources';
// snake cargo key (dispatch + rareCosts keys) → camelCase planet stock field.
const camel = k => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
// The four base cost resources: ship-def field · dispatch cargo key.
const BASE_RES = [
  { field: 'costOre',       cargo: 'ore' },
  { field: 'costSilicates', cargo: 'silicates' },
  { field: 'costHydrogen',  cargo: 'hydrogen' },
  { field: 'costAlloys',    cargo: 'alloys' },
];
const fmt = n => Math.round(n || 0).toLocaleString();
const labelOf = cargo => cargo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// The planet currently in view, learned from the page's own /api/planets/{id}
// GET (relayed by galaxy-fetch-hook.js, MAIN world). Ask for a replay on load in
// case the fetch already happened before we attached the listener.
let currentPlanetId = null;
window.addEventListener('message', e => {
  if (e.origin !== window.location.origin) return;
  if (e.data && e.data.__nxCurrentPlanet != null) currentPlanetId = e.data.__nxCurrentPlanet;
});
window.postMessage({ __nxRequestCurrentPlanet: true }, window.location.origin);

// Total cost to build `qty` more of a ship. Returns { cargoKey: amount }.
function buildCost(def, qty) {
  const tot = {};
  if (qty <= 0) return tot;
  for (const r of BASE_RES) {
    const v = Math.round((def[r.field] || 0) * qty);
    if (v) tot[r.cargo] = (tot[r.cargo] || 0) + v;
  }
  for (const [k, v] of Object.entries(def.rareCosts || {})) {
    if (v) tot[k] = (tot[k] || 0) + Math.round(v * qty);
  }
  return tot;
}

// Ship key from the card image, e.g. /api/images/ships/terran/interceptor.webp
function keyFromCard(card) {
  const img = card.querySelector('img[src*="/ships/"]');
  const m = img && img.src.match(/\/ships\/[^/]+\/([a-z0-9_]+)\.webp/i);
  return m ? m[1] : null;
}

async function fetchJSON(path) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function findShip(ships, shipKey) {
  return (ships || []).find(s => s.key === shipKey);
}

// Owned (undamaged) quantity of a ship on a planet, keyed by ship def key.
function ownedQty(fleet, shipKey) {
  const f = (fleet || []).find(x => x.definition?.key === shipKey);
  return f ? Math.max(0, (f.quantity || 0) - (f.damagedQuantity || 0)) : 0;
}

// Resource cost (dispatch cargo keys) to build `target − from` more of a ship
// on a planet. Exposed for the to-do list (upgrade-queue.js), which sums this
// across every selected item and subtracts planet stock once — not per item,
// or a shared stock pool would get double-counted as covering each item.
window.__nxUpgradeNeed = window.__nxUpgradeNeed || {};
window.__nxUpgradeNeed.ship = async (shipKey, planetId, from, target) => {
  const sd = await fetchJSON(`/api/planets/${planetId}/shipyard`);
  const s = findShip(sd.ships, shipKey);
  if (!s) return {};
  return buildCost(s, Math.max(0, target - from));
};

let panel = null;
function closePanel() { if (panel) { panel.remove(); panel = null; } }

async function openPlanner(shipKey) {
  closePanel();
  const overlay = document.createElement('div');
  panel = overlay;
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; background:rgba(0,0,0,.6);' +
    'display:flex; align-items:center; justify-content:center; font:14px/1.5 system-ui,sans-serif;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

  const box = document.createElement('div');
  box.style.cssText = 'background:#12161f; color:#e6edf3; border:1px solid #d29922; border-radius:10px;' +
    'width:440px; max-width:92vw; max-height:88vh; overflow:auto; padding:18px 20px;';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  if (window.__nxQueue) window.__nxQueue.mountPanel(overlay);

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 12px; font-size:1.2rem;';
  title.textContent = 'Shipyard build planner';
  box.appendChild(title);

  if (currentPlanetId == null) {
    box.innerHTML += '<div style="color:#ff7b72;">Open a planet’s shipyard first.</div>';
    return;
  }

  const row = (labelText) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex; align-items:center; gap:10px; margin:8px 0;';
    const l = document.createElement('div'); l.style.cssText = 'width:110px; color:#9aa4b2;'; l.textContent = labelText;
    r.appendChild(l);
    box.appendChild(r);
    return r;
  };

  // Planet in view — taken from the page's current planet, not chosen by the user.
  const pRow = row('Planet');
  const pName = document.createElement('div');
  pName.style.cssText = 'flex:1; color:#e6edf3;';
  pName.textContent = `Planet #${currentPlanetId}`;
  pRow.appendChild(pName);

  const info = document.createElement('div');
  info.style.cssText = 'color:#8b949e; margin:4px 0 10px; min-height:18px;';
  box.appendChild(info);

  const qtyRow = row('Build qty');
  const qtyInp = document.createElement('input');
  qtyInp.type = 'text'; qtyInp.inputMode = 'numeric';   // text = no spinner arrows
  qtyInp.style.cssText = 'width:56px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:5px 8px; border-radius:6px; text-align:right;';
  qtyInp.addEventListener('input', () => { const c = qtyInp.value.replace(/[^\d]/g, ''); if (c !== qtyInp.value) qtyInp.value = c; });
  const stepBtn = txt => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.style.cssText = 'background:#21262d; border:1px solid #30363d; color:#e6edf3; border-radius:6px; padding:5px 9px; cursor:pointer; line-height:1;';
    return b;
  };
  const setQty = v => { qtyInp.value = String(Math.max(1, v)); recompute(); };
  const minus = stepBtn('−'); minus.onclick = () => setQty((parseInt(qtyInp.value, 10) || 1) - 1);
  const plus = stepBtn('+'); plus.onclick = () => setQty((parseInt(qtyInp.value, 10) || 1) + 1);
  qtyRow.append(minus, qtyInp, plus);
  const qtyHint = document.createElement('span'); qtyHint.style.cssText = 'color:#6e7681;'; qtyRow.appendChild(qtyHint);

  const table = document.createElement('div');
  table.style.cssText = 'margin:12px 0; border-top:1px solid #21262d; padding-top:10px;';
  box.appendChild(table);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; gap:10px; justify-content:flex-end; margin-top:14px;';
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send deficit via Quartermaster';
  sendBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #d29922; background:#9e6a03; color:#fff; cursor:pointer;';
  const addBtn = document.createElement('button');
  addBtn.textContent = '➕ To-do';
  addBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#e6edf3; cursor:pointer; margin-right:auto;';
  addBtn.onclick = () => {
    if (!state || !window.__nxQueue) return;
    const qty = parseInt(qtyInp.value, 10) || 1;
    window.__nxQueue.add({ kind: 'ship', key: shipKey, name: state.def.name,
      planet: pName.textContent, planetId: currentPlanetId,
      from: state.owned, target: state.owned + qty });
  };
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#e6edf3; cursor:pointer;';
  closeBtn.onclick = closePanel;
  actions.append(addBtn, closeBtn, sendBtn);
  box.appendChild(actions);

  let state = null;   // { def, owned, stock } for the selected planet

  async function loadPlanet() {
    state = null; table.textContent = ''; sendBtn.disabled = true;
    info.textContent = 'Loading…';
    let sd, fd, pd;
    try {
      [sd, fd, pd] = await Promise.all([
        fetchJSON(`/api/planets/${currentPlanetId}/shipyard`),
        fetchJSON(`/api/planets/${currentPlanetId}/fleet`),
        fetchJSON(`/api/planets/${currentPlanetId}`),
      ]);
    } catch (e) { info.textContent = `Error: ${e.message}`; return; }
    const pl = pd.planet || pd;
    if (pl.name) pName.textContent = pl.name;
    const def = findShip(sd.ships, shipKey);
    if (!def) { info.textContent = `“${shipKey}” isn't buildable on this planet.`; qtyInp.disabled = true; return; }
    qtyInp.disabled = false;
    const owned = ownedQty(fd.fleet, shipKey);
    state = { def, owned, stock: pl };
    info.textContent = `${def.name} · owned ${owned}`;
    qtyInp.value = '1';
    qtyHint.textContent = `(owned ${owned})`;
    recompute();
  }

  function recompute() {
    table.textContent = '';
    if (!state) return;
    let qty = parseInt(qtyInp.value, 10) || 0;
    qty = Math.max(1, qty);
    qtyInp.value = String(qty);
    const need = buildCost(state.def, qty);

    // Fixed numeric columns so Need/On planet/Deficit align; a vertical rule
    // before each number column and a rule under each row keep them readable.
    const cols = 'display:grid; grid-template-columns:1fr 86px 86px 86px; align-items:center;';
    const numCell = 'text-align:right; padding:5px 10px; border-left:1px solid #21262d;';
    const head = document.createElement('div');
    head.style.cssText = cols + ' color:#8b949e; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #30363d;';
    head.innerHTML = '<div style="padding:5px 0;"></div>' +
      `<div style="${numCell}">Need</div>` +
      `<div style="${numCell}">On planet</div>` +
      `<div style="${numCell}">Deficit</div>`;
    table.appendChild(head);

    const deficit = {};
    for (const [cargo, n] of Object.entries(need)) {
      if (!n) continue;
      const have = state.stock[camel(cargo)] || 0;
      const short = Math.max(0, n - have);
      deficit[cargo] = short;
      const line = document.createElement('div');
      line.style.cssText = cols + ' border-bottom:1px solid #161b22;';
      line.innerHTML =
        `<div style="display:flex; align-items:center; gap:6px; padding:5px 0;"><img src="${IMG}/${cargo}.webp" width="15" height="15" style="width:15px;height:15px;"> ${labelOf(cargo)}</div>` +
        `<div style="${numCell}">${fmt(n)}</div>` +
        `<div style="${numCell} color:#8b949e;">${fmt(have)}</div>` +
        `<div style="${numCell} color:${short > 0 ? '#ff7b72' : '#56d364'};">${short > 0 ? fmt(short) : '—'}</div>`;
      table.appendChild(line);
    }
    const totalShort = Object.values(deficit).reduce((s, v) => s + v, 0);
    sendBtn.disabled = totalShort <= 0;
    sendBtn.title = totalShort <= 0 ? 'Planet already has enough' : 'Open the Quartermaster to ship the deficit here';
    sendBtn.onclick = () => {
      const nonZero = Object.fromEntries(Object.entries(deficit).filter(([, v]) => v > 0));
      closePanel();
      if (window.__nxDeliverToPlanet) window.__nxDeliverToPlanet(currentPlanetId, nonZero);
    };
  }

  qtyInp.addEventListener('input', recompute);
  await loadPlanet();
}

// ── Find the build-row that lives near a given card, walking up a few
// ancestor levels since the row is a sibling of the card's header, not the
// card itself. ───────────────────────────────────────────────────────────
function findNearbyRow(card, rowSelector, maxLevels = 3) {
  let el = card.parentElement;
  for (let i = 0; i < maxLevels && el; i++) {
    const row = el.querySelector(rowSelector);
    if (row) return row;
    el = el.parentElement;
  }
  return null;
}

// ── Inject the button onto ship cards ────────────────────────────────────────
function injectButtons() {
  document.querySelectorAll('div.entity-image').forEach(card => {
    if (!card.querySelector('img[src*="/ships/"]')) return;
    const row = findNearbyRow(card, '.ship-build-row');
    if (!row || row.querySelector('.nx-ship-btn')) return;
    const key = keyFromCard(card);
    if (!key) return;
    const btn = document.createElement('button');
    btn.className = 'nx-ship-btn';
    btn.type = 'button';
    btn.textContent = '🚀';
    btn.title = 'Plan build resources (addon)';
    btn.style.cssText = 'width:26px; height:26px; padding:0; margin-left:8px; vertical-align:middle;' +
      'line-height:24px; font-size:16px; border-radius:6px; border:1px solid #d29922; background:#0d1117cc;' +
      'color:#e3b341; cursor:pointer;';
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openPlanner(key); });
    row.appendChild(btn);
  });
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; injectButtons(); });
}
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
schedule();
})();
}
