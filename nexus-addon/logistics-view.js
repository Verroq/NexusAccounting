// Logistics View: a topbar button that opens a body-level overlay with (1) the
// total of each ship type across all planets and (2) a card per planet/outpost
// showing its resources and ships. Same overlay pattern as empire-view.js —
// reuses the game's dark styling, lives in <body> so React re-renders can't wipe
// it. Data fetched same-origin (cookie), read-only for now.
//
// Drag-and-drop transfers between colonies are a follow-up: each move launches a
// real transport dispatch (POST /fleet/dispatch — cargo ships + fuel + travel),
// so it needs a per-drop confirmation and is deliberately not wired yet.
//
// IIFE + re-run guard: Firefox can inject a content script twice into the same
// isolated world; top-level `const`s would then throw "redeclaration of const".
if (!window.__nxLogisticsView) {
window.__nxLogisticsView = true;
(function () {
const IMG = '/images/resources';
// Colony resource fields (camelCase, as the planet/outpost APIs return them) →
// label + icon filename.
// k = colony field (camelCase, as the APIs return it); cargo = dispatch cargo key
// (snake_case, as /fleet/dispatch expects).
const RESOURCES = [
  { k: 'ore',         cargo: 'ore',          label: 'Ore',         icon: 'ore.webp' },
  { k: 'silicates',   cargo: 'silicates',    label: 'Silicates',   icon: 'silicates.webp' },
  { k: 'hydrogen',    cargo: 'hydrogen',     label: 'Hydrogen',    icon: 'hydrogen.webp' },
  { k: 'alloys',      cargo: 'alloys',       label: 'Alloys',      icon: 'alloys.webp' },
  { k: 'cryoIce',     cargo: 'cryo_ice',     label: 'Cryo-Ice',    icon: 'cryo_ice.webp' },
  { k: 'quantumDust', cargo: 'quantum_dust', label: 'Quantum Dust',icon: 'quantum_dust.webp' },
  { k: 'plasmaCore',  cargo: 'plasma_core',  label: 'Plasma Core', icon: 'plasma_core.webp' },
  { k: 'bioExtract',  cargo: 'bio_extract',  label: 'Bio-Extract', icon: 'bio_extract.webp' },
  { k: 'darkMatter',  cargo: 'dark_matter',  label: 'Dark Matter', icon: 'dark_matter.webp' },
  { k: 'antimatter',  cargo: 'antimatter',   label: 'Antimatter',  icon: 'antimatter.webp' },
];
const RES_BY_K = Object.fromEntries(RESOURCES.map(r => [r.k, r]));

let dragItem = null;   // { src, resKey } while a resource chip is being dragged
let builder = null;    // staged transfer being configured in the top card
let builderEl = null;  // the top card element
let allColonies = [];  // current colonies (for the collect source-planet picker)

// Effective cargo capacity: base × (1 + cargo research + commander + shuttle
// bonus), fetched once. Mirrors the Scouting tab's hauler sizing.
let _cargoCtx = null;
async function cargoContext() {
  if (_cargoCtx) return _cargoCtx;
  const [research, me] = await Promise.all([
    jget('/api/research').catch(() => ({ research: [] })),
    jget('/api/auth/me').catch(() => ({})),
  ]);
  let general = 0, shuttle = 0;
  for (const r of (research.research || [])) {
    const lvl = r.level || 0; if (!lvl) continue;
    for (const e of (r.effects || [])) {
      if (e.type === 'cargo_bonus') general += (e.value || 0) * lvl;
      else if (e.type === 'shuttle_cargo_bonus') shuttle += (e.value || 0) * lvl;
    }
  }
  _cargoCtx = { general, shuttle, commander: (me.user && me.user.activeLeaderBonuses && me.user.activeLeaderBonuses.cargoBonus) || 0 };
  return _cargoCtx;
}
function effCap(def, ctx) {
  const b = ctx.general + ctx.commander + (def.key === 'transport_shuttle' ? ctx.shuttle : 0);
  return Math.floor((def.cargoCapacity || 0) * (1 + b));
}
// Fewest cargo ships (largest cap first, capped to availability) to carry `total`.
function planFleet(total, ships) {
  const sorted = ships.filter(s => s.cap > 0 && s.avail > 0).sort((a, b) => b.cap - a.cap);
  let rem = total; const out = [];
  for (let i = 0; i < sorted.length && rem > 0; i++) {
    const s = sorted[i];
    const want = i === sorted.length - 1 ? Math.ceil(rem / s.cap) : Math.floor(rem / s.cap);
    const n = Math.min(want, s.avail);
    if (n > 0) { out.push({ shipDefId: s.shipDefId, quantity: n, cap: s.cap, name: s.name }); rem -= n * s.cap; }
  }
  return { plan: out, remaining: Math.max(0, rem) };
}
function fmtDur(sec) {
  if (!sec || sec < 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

const fmt = n => Math.round(n || 0).toLocaleString();

async function jget(path) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

let overlay = null;
function closeView() { if (overlay) { overlay.remove(); overlay = null; } }

async function openView() {
  if (overlay) { closeView(); return; }   // toggle
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; overflow:auto;' +
    'background:#080a10; padding:24px; box-sizing:border-box;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeView(); });

  const page = document.createElement('div');
  page.style.cssText = 'max-width:1280px; margin:0 auto; color:#c9d1d9;';
  overlay.appendChild(page);
  document.body.appendChild(overlay);
  page.innerHTML = `<h1 style="margin:0 0 4px; font-size:1.6rem; color:#e6edf3;">Quartermaster</h1>
    <p class="lv-sub" style="margin:0 0 16px; color:#9aa4b2; font-size:0.9rem;">Loading colonies…</p>`;

  const close = document.createElement('button');
  close.textContent = '✕'; close.title = 'Close (Esc)';
  close.style.cssText = 'position:fixed; top:16px; right:20px; z-index:1; background:transparent;' +
    'border:none; color:#8b949e; font-size:1.6rem; cursor:pointer; line-height:1;';
  close.addEventListener('click', closeView);
  overlay.appendChild(close);
  const onKey = e => { if (e.key === 'Escape') { closeView(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  let colonies, missions = [];
  try {
    const [planetList, outpostData, missionsData] = await Promise.all([
      jget('/api/planets'), jget('/api/outposts').catch(() => ({})), jget('/api/fleet/missions').catch(() => ({ missions: [] })),
    ]);
    const planets = (planetList.planets || []).filter(p => p.id != null);
    const details = await Promise.all(planets.map(p => Promise.all([
      jget(`/api/planets/${p.id}`).catch(() => null),
      jget(`/api/planets/${p.id}/fleet`).catch(() => ({ fleet: [] })),
    ])));
    missions = missionsData.missions || [];
    const outposts = outpostData.outposts || (Array.isArray(outpostData) ? outpostData : []);
    colonies = planets.map((p, i) => {
      const [detail, fleet] = details[i];
      const res = (detail && detail.planet) || p;
      return { id: p.id, systemId: p.systemId, kind: 'Planet', name: p.name, res, ships: (fleet.fleet || []) };
    }).concat(outposts.map(o => ({ id: o.id, systemId: o.systemId, kind: 'Outpost', name: o.name || `Outpost #${o.id}`, res: o, ships: null, deployed: o.deployedShipCount })));
  } catch (e) {
    page.querySelector('.lv-sub').textContent = `Error: ${e.message}`;
    return;
  }
  if (!overlay) return;
  render(page, colonies, missions);
}

// A titled box of ship chips (qty × name) — used for stationed + in-flight totals.
function shipBox(title, list, emptyMsg) {
  const sec = document.createElement('div');
  sec.style.cssText = 'background:#0d1117; border:1px solid #21262d; border-radius:10px; padding:14px 16px; margin-bottom:14px;';
  sec.innerHTML = `<div style="color:#f0883e; font-size:0.9rem; margin-bottom:8px;">${title}</div>`;
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px 14px;';
  if (!list.length) chips.innerHTML = `<span style="color:#484f58;">${emptyMsg}</span>`;
  for (const s of list) {
    const chip = document.createElement('span'); chip.style.cssText = 'font-size:0.88rem;';
    chip.innerHTML = `<b style="color:#e6edf3;">${fmt(s.qty)}</b>&times; <span style="color:#9aa4b2;">${s.name}</span>`;
    chips.appendChild(chip);
  }
  sec.appendChild(chips);
  return sec;
}

function render(page, colonies, missions = []) {
  page.querySelector('.lv-sub').innerHTML =
    `${colonies.length} colonies (${colonies.filter(c => c.kind === 'Planet').length} planets, ${colonies.filter(c => c.kind === 'Outpost').length} outposts)` +
    ` · <span style="color:#6e7681;">drag a resource or ship onto another colony to send it (confirm before dispatch)</span>`;

  allColonies = colonies;
  // Transfer builder card (populated on drop, hidden otherwise), pinned on top.
  builder = null;
  builderEl = document.createElement('div');
  builderEl.style.cssText = 'display:none; position:sticky; top:0; z-index:2; margin-bottom:16px;';
  page.appendChild(builderEl);

  // ── Total ships stationed (summed across colonies) ──
  const totals = new Map();   // shipDefId → { name, sortOrder, qty }
  for (const c of colonies) {
    for (const f of (c.ships || [])) {
      const def = f.definition || {};
      const cur = totals.get(f.shipDefId) || { name: def.name || `#${f.shipDefId}`, sortOrder: def.sortOrder || 0, qty: 0 };
      cur.qty += f.quantity || 0;
      totals.set(f.shipDefId, cur);
    }
  }
  const totalList = [...totals.values()].filter(s => s.qty > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  page.appendChild(shipBox('Total ships (stationed)', totalList, 'No ships stationed.'));

  // ── In flight: ships on active missions (fleetComposition per mission) ──
  const flight = new Map();
  for (const m of missions) {
    for (const f of (m.fleetComposition || [])) {
      const cur = flight.get(f.shipDefId) || { name: f.shipName || `#${f.shipDefId}`, qty: 0 };
      cur.qty += f.quantity || 0;
      flight.set(f.shipDefId, cur);
    }
  }
  const flightList = [...flight.values()].filter(s => s.qty > 0).sort((a, b) => b.qty - a.qty);
  page.appendChild(shipBox(`In flight (${missions.length} mission${missions.length === 1 ? '' : 's'})`, flightList, 'None in flight.'));

  // ── One card per colony: resources + ships ──
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px;';
  for (const c of colonies) grid.appendChild(colonyCard(c));
  page.appendChild(grid);
}

function colonyCard(c) {
  const card = document.createElement('div');
  card.style.cssText = 'background:#0d1117; border:1px solid #21262d; border-radius:10px; padding:12px 14px;';
  // Drop target: accept a dragged resource/ship from another colony. An outpost
  // resource can only land on a planet (→ collect).
  const accepts = () => dragItem && dragItem.src !== c && c.id != null &&
    !(dragItem.type === 'resource' && dragItem.src.kind === 'Outpost' && c.kind !== 'Planet');
  card.addEventListener('dragover', e => { if (accepts()) { e.preventDefault(); card.style.outline = '2px dashed #58a6ff'; } });
  card.addEventListener('dragleave', () => { card.style.outline = ''; });
  card.addEventListener('drop', e => {
    e.preventDefault(); card.style.outline = '';
    const it = dragItem; dragItem = null;
    if (!it || it.src === c || c.id == null) return;
    if (it.type === 'resource' && it.src.kind === 'Outpost') { if (c.kind === 'Planet') stageCollectResource(it.src, c, it.resKey); return; }
    stageTransfer(it, c);
  });
  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:baseline; gap:8px; margin-bottom:8px;';
  head.innerHTML = `<b style="color:#e6edf3;">${c.name}</b>` +
    `<span style="color:#8b949e; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${c.kind}</span>`;
  card.appendChild(head);

  // Resources
  const resWrap = document.createElement('div');
  resWrap.style.cssText = 'display:flex; flex-direction:column; gap:3px; font-size:0.82rem;';
  for (const r of RESOURCES) {
    const v = c.res ? c.res[r.k] : 0;
    if (!v) continue;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:3px 5px; border-radius:6px; border:1px solid transparent;';
    row.innerHTML = `<img src="${IMG}/${r.icon}" width="15" height="15" style="width:15px;height:15px;" alt="">` +
      `<span style="color:#9aa4b2; flex:1;">${r.label}</span><span style="color:#e6edf3;">${fmt(v)}</span>`;
    // Draggable: planet resources → deliver/supply anywhere; outpost resources →
    // drop on a planet to collect them there.
    if (c.id != null) {
      row.draggable = true; row.style.cursor = 'grab';
      row.title = c.kind === 'Outpost' ? 'Drag to a planet to collect' : 'Drag to another colony to send';
      row.style.border = '1px solid #30363d'; row.style.background = '#161b22';
      const grip = document.createElement('span'); grip.textContent = '⠿';
      grip.style.cssText = 'color:#484f58; font-size:0.8rem; cursor:grab;';
      row.insertBefore(grip, row.firstChild);
      row.addEventListener('mouseenter', () => { row.style.borderColor = '#58a6ff'; });
      row.addEventListener('mouseleave', () => { row.style.borderColor = '#30363d'; });
      row.addEventListener('dragstart', () => { dragItem = { type: 'resource', src: c, resKey: r.k, max: v }; row.style.opacity = '0.5'; });
      row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    }
    resWrap.appendChild(row);
  }
  if (!resWrap.childElementCount) resWrap.innerHTML = '<span style="color:#484f58;">No resources.</span>';
  card.appendChild(resWrap);

  // Ships
  const shipHead = document.createElement('div');
  shipHead.style.cssText = 'color:#8b949e; font-size:0.72rem; margin:10px 0 4px; text-transform:uppercase; letter-spacing:0.05em;';
  shipHead.textContent = 'Ships';
  card.appendChild(shipHead);
  const shipWrap = document.createElement('div');
  shipWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px 12px; font-size:0.8rem;';
  if (c.ships == null) {
    shipWrap.innerHTML = `<span style="color:#9aa4b2;">${c.deployed ? `${fmt(c.deployed)} deployed` : 'none'}</span>`;
  } else {
    const ships = c.ships.filter(f => (f.quantity || 0) > 0)
      .sort((a, b) => (a.definition?.sortOrder || 0) - (b.definition?.sortOrder || 0));
    if (!ships.length) shipWrap.innerHTML = '<span style="color:#484f58;">none</span>';
    for (const f of ships) {
      const sp = document.createElement('span');
      const nm = (f.definition || {}).name || '#' + f.shipDefId;
      sp.style.cssText = 'display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px; border:1px solid transparent;';
      sp.innerHTML = `<b style="color:#e6edf3;">${fmt(f.quantity)}</b>&times; <span style="color:#9aa4b2;">${nm}</span>`;
      // Draggable → relocate these ships to another colony.
      const avail = (f.quantity || 0) - (f.damagedQuantity || 0);
      if (c.id != null && avail > 0) {
        sp.draggable = true; sp.style.cursor = 'grab'; sp.title = 'Drag to another colony to relocate';
        sp.style.border = '1px solid #30363d'; sp.style.background = '#161b22';
        const grip = document.createElement('span'); grip.textContent = '⠿';
        grip.style.cssText = 'color:#484f58; font-size:0.75rem;';
        sp.insertBefore(grip, sp.firstChild);
        sp.addEventListener('mouseenter', () => { sp.style.borderColor = '#58a6ff'; });
        sp.addEventListener('mouseleave', () => { sp.style.borderColor = '#30363d'; });
        sp.addEventListener('dragstart', () => { dragItem = { type: 'ship', src: c, shipDefId: f.shipDefId, name: nm, max: avail }; sp.style.opacity = '0.5'; });
        sp.addEventListener('dragend', () => { sp.style.opacity = '1'; });
      }
      shipWrap.appendChild(sp);
    }
  }
  card.appendChild(shipWrap);
  return card;
}

async function jpost(path, body) {
  const r = await fetch(path, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.message || `${path} → ${r.status}`);
  return data;
}
const fuelEstimate = (sourcePlanetId, targetSystemId, ships) =>
  jpost('/api/fleet/fuel-estimate', { sourcePlanetId, targetSystemId, ships });
function refresh() { closeView(); openView(); }

// Stage a dropped resource/ship into the top builder card. Same source+target+mode
// accumulates (more resources or ship types); a different combo starts fresh.
function stageTransfer(item, target) {
  const src = item.src, mode = item.type === 'resource' ? 'resource' : 'ship';
  if (!builder || builder.src.id !== src.id || builder.target.id !== target.id || builder.mode !== mode) {
    builder = { src, target, mode, res: {}, ships: {}, cargoManual: null };
  }
  if (mode === 'resource') builder.res[item.resKey] = { amount: Math.floor(item.max), max: Math.floor(item.max) };
  else builder.ships[item.shipDefId] = { name: item.name, qty: item.max, max: item.max };
  builder.cargoManual = null;   // re-autoplan on any change
  renderBuilder();
}

// Cargo-capable ships on a colony, with effective capacity.
async function cargoShipsOf(colony) {
  const ctx = await cargoContext();
  return ((colony && colony.ships) || []).map(f => {
    const def = f.definition || {};
    return { shipDefId: f.shipDefId, name: def.name || ('#' + f.shipDefId), cap: effCap(def, ctx), avail: (f.quantity || 0) - (f.damagedQuantity || 0) };
  }).filter(s => s.cap > 0 && s.avail > 0);
}

// Collect: a resource dragged from an outpost onto a planet. The planet is the
// fleet origin/return; drop more outpost resources onto the same planet to add
// their types. Fleet goes planet → outpost → back with what fits the cargo.
function stageCollectResource(outpost, planet, resKey) {
  if (!builder || builder.mode !== 'collect' || builder.outpost.id !== outpost.id || builder.srcPlanetId !== planet.id) {
    builder = { mode: 'collect', outpost, srcPlanetId: planet.id, filter: new Set(), cargoManual: {} };
  }
  builder.filter.add(resKey);
  renderBuilder();
}

function fieldRow(labelHtml, input, onRemove) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:8px; margin:4px 0;';
  const l = document.createElement('div'); l.style.cssText = 'flex:1; display:flex; align-items:center; gap:6px;'; l.innerHTML = labelHtml;
  row.append(l, input);
  if (onRemove) {
    const x = document.createElement('button'); x.textContent = '✕';
    x.style.cssText = 'background:transparent; border:none; color:#8b949e; cursor:pointer;';
    x.onclick = onRemove; row.appendChild(x);
  }
  return row;
}
function numInput(value, max) {
  // Text (not number) so there are no spinner arrows; guard to positive integers.
  const i = document.createElement('input');
  i.type = 'text'; i.inputMode = 'numeric';
  i.value = String(value);
  i.style.cssText = 'width:120px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:4px 7px; border-radius:6px; text-align:right;';
  i.addEventListener('input', () => { const c = i.value.replace(/[^\d]/g, ''); if (c !== i.value) i.value = c; });
  return i;
}

async function renderBuilder() {
  if (!builderEl) return;
  builderEl.innerHTML = '';
  if (!builder) { builderEl.style.display = 'none'; return; }
  builderEl.style.display = '';
  const b = builder;
  const toOutpost = b.mode !== 'collect' && b.target.kind === 'Outpost';
  const box = document.createElement('div');
  box.style.cssText = 'background:#12161f; border:1px solid #2ea043; border-radius:10px; padding:14px 16px;';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:baseline; gap:8px; margin-bottom:10px;';
  box.appendChild(head);

  const status = document.createElement('div'); status.style.cssText = 'color:#8b949e; font-size:0.82rem; min-height:16px; margin-top:6px;';
  const fuelLine = document.createElement('div'); fuelLine.style.cssText = 'color:#9aa4b2; font-size:0.85rem; margin-top:8px;';
  const send = document.createElement('button'); send.textContent = 'Send';
  send.style.cssText = 'padding:6px 16px; border-radius:6px; border:1px solid #2ea043; background:#238636; color:#fff; cursor:pointer;';
  const clear = document.createElement('button'); clear.textContent = 'Clear';
  clear.style.cssText = 'padding:6px 14px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#e6edf3; cursor:pointer;';
  clear.onclick = () => { builder = null; renderBuilder(); };

  let getShips = () => [];
  let fuelSrc, fuelSys;

  if (b.mode === 'collect') {
    const planets = allColonies.filter(c => c.kind === 'Planet');
    const srcPlanet = planets.find(c => c.id === b.srcPlanetId) || planets[0];
    head.innerHTML = `<b style="color:#e6edf3;">Collect resources</b>` +
      `<span style="color:#f0883e;">${srcPlanet ? srcPlanet.name : '?'} → ${b.outpost.name} → back</span>`;
    // Source planet picker.
    const sel = document.createElement('select');
    sel.style.cssText = 'background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:4px 7px; border-radius:6px;';
    for (const p of planets) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; if (p.id === b.srcPlanetId) o.selected = true; sel.appendChild(o); }
    sel.addEventListener('change', () => { b.srcPlanetId = Number(sel.value); b.cargoManual = {}; renderBuilder(); });
    box.appendChild(fieldRow('<span style="color:#9aa4b2;">From planet</span>', sel));
    // Resource types to collect (present on the outpost).
    const typeWrap = document.createElement('div');
    typeWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px 14px; margin:8px 0;';
    for (const r of RESOURCES) {
      const have = (b.outpost.res && b.outpost.res[r.k]) || 0;
      if (have <= 0) continue;
      const lbl = document.createElement('label'); lbl.style.cssText = 'display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; cursor:pointer;';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = b.filter.has(r.k);
      cb.addEventListener('change', () => { if (cb.checked) b.filter.add(r.k); else b.filter.delete(r.k); updateSend(); });
      lbl.append(cb, Object.assign(document.createElement('img'), { src: `${IMG}/${r.icon}`, width: 14, height: 14 }), document.createTextNode(`${r.label} (${fmt(have)})`));
      typeWrap.appendChild(lbl);
    }
    box.appendChild(typeWrap);
    // Transport ships from the source planet.
    const cargoShips = await cargoShipsOf(srcPlanet);
    const cw = document.createElement('div'); cw.style.cssText = 'border-top:1px solid #21262d; margin-top:6px; padding-top:8px;';
    cw.innerHTML = '<div style="color:#8b949e; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Transport ships</div>';
    box.appendChild(cw);
    const capLine = document.createElement('div'); capLine.style.cssText = 'font-size:0.82rem; margin-top:4px;';
    const updateSend = () => {
      const have = cargoShips.reduce((s, cs) => s + (b.cargoManual[cs.shipDefId] || 0) * cs.cap, 0);
      capLine.innerHTML = `Cargo capacity <b style="color:#e6edf3">${fmt(have)}</b> · collects what fits`;
      send.disabled = !getShips().length || b.filter.size === 0;
      refreshFuel();
    };
    for (const cs of cargoShips) {
      const inp = numInput(b.cargoManual[cs.shipDefId] || 0, cs.avail);
      inp.addEventListener('input', () => { b.cargoManual[cs.shipDefId] = Math.min(cs.avail, Math.max(0, parseInt(inp.value, 10) || 0)); updateSend(); });
      cw.appendChild(fieldRow(`${cs.name} <span style="color:#6e7681;">/ ${fmt(cs.avail)} · ${fmt(cs.cap)} ea</span>`, inp));
    }
    if (!cargoShips.length) cw.innerHTML += '<span style="color:#ff7b72; font-size:0.82rem;">No cargo ships on this planet.</span>';
    cw.appendChild(capLine);
    getShips = () => cargoShips.map(cs => ({ shipDefId: cs.shipDefId, quantity: b.cargoManual[cs.shipDefId] || 0 })).filter(s => s.quantity > 0);
    fuelSrc = b.srcPlanetId; fuelSys = b.outpost.systemId;
    box.append(fuelLine);
    updateSend();
  } else if (b.mode === 'resource') {
    head.innerHTML = `<b style="color:#e6edf3;">${toOutpost ? 'Supply outpost' : 'Deliver resources'}</b>` +
      `<span style="color:#f0883e;">${b.src.name} → ${b.target.name}</span>` +
      `<span style="color:#6e7681; font-size:0.8rem; margin-left:6px;">drag more onto ${b.target.name} to add</span>`;
    for (const [k, ent] of Object.entries(b.res)) {
      const r = RES_BY_K[k];
      const inp = numInput(ent.amount, ent.max);
      inp.addEventListener('input', () => { ent.amount = Math.min(ent.max, Math.max(0, parseInt(inp.value, 10) || 0)); refreshCargo(); });
      box.appendChild(fieldRow(`<img src="${IMG}/${r.icon}" width="15" height="15" style="width:15px;height:15px;"> ${r.label} <span style="color:#6e7681;">/ ${fmt(ent.max)}</span>`,
        inp, () => { delete b.res[k]; b.cargoManual = null; if (!Object.keys(b.res).length) builder = null; renderBuilder(); }));
    }
    const cargoShips = await cargoShipsOf(b.src);
    const cw = document.createElement('div'); cw.style.cssText = 'border-top:1px solid #21262d; margin-top:10px; padding-top:8px;';
    cw.innerHTML = '<div style="color:#8b949e; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Transport ships</div>';
    box.appendChild(cw);
    const capLine = document.createElement('div'); capLine.style.cssText = 'font-size:0.82rem; margin-top:4px;';
    const totalCargo = () => Object.values(b.res).reduce((s, e) => s + e.amount, 0);
    if (b.cargoManual == null) { const { plan } = planFleet(totalCargo(), cargoShips); b.cargoManual = {}; for (const p of plan) b.cargoManual[p.shipDefId] = p.quantity; }
    const refreshCargo = () => {
      const need = totalCargo();
      const have = cargoShips.reduce((s, cs) => s + (b.cargoManual[cs.shipDefId] || 0) * cs.cap, 0);
      capLine.innerHTML = `Capacity <b style="color:${have >= need ? '#56d364' : '#ff7b72'}">${fmt(have)}</b> / need ${fmt(need)}`;
      send.disabled = need <= 0 || have < need;
      refreshFuel();
    };
    for (const cs of cargoShips) {
      const inp = numInput(b.cargoManual[cs.shipDefId] || 0, cs.avail);
      inp.addEventListener('input', () => { b.cargoManual[cs.shipDefId] = Math.min(cs.avail, Math.max(0, parseInt(inp.value, 10) || 0)); refreshCargo(); });
      cw.appendChild(fieldRow(`${cs.name} <span style="color:#6e7681;">/ ${fmt(cs.avail)} · ${fmt(cs.cap)} ea</span>`, inp));
    }
    if (!cargoShips.length) cw.innerHTML += '<span style="color:#ff7b72; font-size:0.82rem;">No cargo ships on this colony.</span>';
    cw.appendChild(capLine);
    getShips = () => cargoShips.map(cs => ({ shipDefId: cs.shipDefId, quantity: b.cargoManual[cs.shipDefId] || 0 })).filter(s => s.quantity > 0);
    fuelSrc = b.src.id; fuelSys = b.target.systemId;
    box.append(fuelLine);
    refreshCargo();
  } else {   // ship
    head.innerHTML = `<b style="color:#e6edf3;">${toOutpost ? 'Deploy ships' : 'Relocate ships'}</b>` +
      `<span style="color:#f0883e;">${b.src.name} → ${b.target.name}</span>` +
      `<span style="color:#6e7681; font-size:0.8rem; margin-left:6px;">drag more onto ${b.target.name} to add</span>`;
    for (const [id, ent] of Object.entries(b.ships)) {
      const inp = numInput(ent.qty, ent.max);
      inp.addEventListener('input', () => { ent.qty = Math.min(ent.max, Math.max(0, parseInt(inp.value, 10) || 0)); refreshFuel(); send.disabled = !getShips().length; });
      box.appendChild(fieldRow(`${ent.name} <span style="color:#6e7681;">/ ${fmt(ent.max)}</span>`, inp,
        () => { delete b.ships[id]; if (!Object.keys(b.ships).length) builder = null; renderBuilder(); }));
    }
    getShips = () => Object.entries(b.ships).map(([id, e]) => ({ shipDefId: Number(id), quantity: e.qty })).filter(s => s.quantity > 0);
    fuelSrc = b.src.id; fuelSys = b.target.systemId;
    box.append(fuelLine);
    send.disabled = !getShips().length;
  }

  async function refreshFuel() {
    const ships = getShips();
    if (!ships.length) { fuelLine.textContent = ''; return; }
    fuelLine.textContent = 'Fuel: …';
    const est = await fuelEstimate(fuelSrc, fuelSys, ships).catch(() => null);
    fuelLine.textContent = est ? `Fuel: ${fmt(est.fuelCost)} H · ETA ${fmtDur(est.travelTime)}${est.inRange === false ? ' · OUT OF RANGE' : ''}` : 'Fuel: —';
  }
  if (b.mode === 'ship') refreshFuel();

  // Endpoint + body per mode/target (payloads match the game's own requests).
  function sendSpec() {
    const ships = getShips();
    if (b.mode === 'collect')
      return { path: `/api/outposts/${b.outpost.id}/collect`, body: { sourcePlanetId: b.srcPlanetId, ships, resourceFilter: [...b.filter].map(k => RES_BY_K[k].cargo) } };
    if (b.mode === 'resource') {
      const resources = Object.fromEntries(Object.entries(b.res).filter(([, e]) => e.amount > 0).map(([k, e]) => [RES_BY_K[k].cargo, e.amount]));
      return toOutpost
        ? { path: `/api/outposts/${b.target.id}/supply`, body: { sourcePlanetId: b.src.id, ships, resources } }
        : { path: '/api/fleet/dispatch', body: { sourcePlanetId: b.src.id, targetPlanetId: b.target.id, missionType: 'deliver', ships, cargo: resources } };
    }
    return toOutpost
      ? { path: `/api/outposts/${b.target.id}/garrison`, body: { sourcePlanetId: b.src.id, ships } }
      : { path: '/api/fleet/dispatch', body: { sourcePlanetId: b.src.id, targetPlanetId: b.target.id, missionType: 'transfer', ships, cargo: {} } };
  }

  send.onclick = async () => {
    if (!getShips().length) return;
    send.disabled = true; status.textContent = 'Sending…';
    try { const s = sendSpec(); await jpost(s.path, s.body); builder = null; refresh(); }
    catch (e) { status.innerHTML = `<span style="color:#ff7b72;">${e.message}</span>`; send.disabled = false; }
  };

  const foot = document.createElement('div');
  foot.style.cssText = 'display:flex; gap:10px; justify-content:flex-end; align-items:center; margin-top:10px;';
  foot.append(status, clear, send);
  box.appendChild(foot);
  builderEl.appendChild(box);
}

// Inject the topbar button (re-injected if the SPA re-renders the topbar).
function injectButton() {
  if (document.getElementById('nx-logistics-btn')) return;
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'nx-logistics-btn';
  btn.type = 'button';
  btn.title = 'Quartermaster — fleet & resources overview (addon)';
  btn.textContent = '📦 Quartermaster';
  btn.style.cssText = 'margin:0 10px; padding:7px 14px; border-radius:7px; cursor:pointer;' +
    'font-size:0.92rem; font-weight:600; border:1px solid #3a4256; background:#1a1f2b; color:#eee;';
  btn.addEventListener('click', openView);
  const left = bar.querySelector('.topbar-left') || bar;
  left.appendChild(btn);
}

new MutationObserver(injectButton).observe(document.documentElement, { childList: true, subtree: true });
injectButton();
})();
}
