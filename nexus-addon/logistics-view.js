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
const ext = (typeof browser !== 'undefined' ? browser : chrome);
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
const BASE4 = new Set(['ore', 'silicates', 'hydrogen', 'alloys']);
// Storage cap for one resource on a colony. Planets carry a per-resource cap
// for the base four (`oreStorage`, …); moons share one `storage` cap across
// the base four instead; outposts share one `basicStorage` across the base
// four. All three share one `rareResourceStorage`/`rareStorage` cap across the
// other six (rare) resources.
function storageCap(c, k) {
  if (!c.res) return null;
  if (c.kind === 'Outpost') return BASE4.has(k) ? (c.res.basicStorage ?? null) : (c.res.rareStorage ?? null);
  if (c.kind === 'Moon') return BASE4.has(k) ? (c.res.storage ?? null) : (c.res.rareResourceStorage ?? null);
  return BASE4.has(k) ? (c.res[`${k}Storage`] ?? null) : (c.res.rareResourceStorage ?? null);
}

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
const canCarry = (h, k) => !h.allowed || h.allowed.includes(k);
// Restricted haulers (ore_freighter, tanker) first (largest cap), then general —
// dedicating specialised haulers to their resources frees general haulers for the
// rest. Greedy fill; used by both the planner and the feasibility check.
function haulerOrder(haulers) {
  return haulers.slice().sort((a, b) => (Number(!!b.allowed) - Number(!!a.allowed)) || (b.cap - a.cap));
}
function fillFrom(rem, capLeft, h) {
  for (const k of Object.keys(rem).filter(k => canCarry(h, k) && rem[k] > 0).sort((a, b) => rem[b] - rem[a])) {
    const take = Math.min(rem[k], capLeft); rem[k] -= take; capLeft -= take; if (capLeft <= 0) break;
  }
}
// How much of `amounts` (snake→qty) the given ship counts CAN'T carry.
function residualAfter(shipQtys, amounts, haulers) {
  const rem = { ...amounts };
  for (const h of haulerOrder(haulers)) fillFrom(rem, (shipQtys[h.shipDefId] || 0) * h.cap, h);
  return Object.values(rem).reduce((s, v) => s + Math.max(0, v), 0);
}
// Fewest haulers to carry `amounts`, respecting each ship's allowedCargo.
function planFleetMulti(amounts, haulers) {
  const rem = { ...amounts };
  const plan = {};
  for (const h of haulerOrder(haulers)) {
    const need = Object.keys(rem).reduce((s, k) => s + (canCarry(h, k) ? Math.max(0, rem[k]) : 0), 0);
    if (need <= 0) continue;
    const n = Math.min(h.avail, Math.ceil(need / h.cap));
    if (n <= 0) continue;
    plan[h.shipDefId] = (plan[h.shipDefId] || 0) + n;
    fillFrom(rem, n * h.cap, h);
  }
  return { plan, remaining: Object.values(rem).reduce((s, v) => s + Math.max(0, v), 0) };
}
function fmtDur(sec) {
  if (!sec || sec < 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

const fmt = n => Math.round(n || 0).toLocaleString();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function jget(path) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

let overlay = null;
function closeView() { stopDragScroll(); if (overlay) { overlay.remove(); overlay = null; } }

// Native drag disables wheel scrolling, so auto-scroll the overlay while the
// dragged pointer sits near the top/bottom edge.
let dragScrollY = null, dragScrollRAF = null;
function startDragScroll() {
  if (dragScrollRAF) return;
  const step = () => {
    if (!overlay || dragScrollY == null) { dragScrollRAF = null; return; }
    const edge = 110, h = window.innerHeight;
    if (dragScrollY < edge) overlay.scrollTop -= (edge - dragScrollY) * 1.6 + 6;
    else if (dragScrollY > h - edge) overlay.scrollTop += (dragScrollY - (h - edge)) * 1.6 + 6;
    dragScrollRAF = requestAnimationFrame(step);
  };
  dragScrollRAF = requestAnimationFrame(step);
}
function stopDragScroll() { if (dragScrollRAF) cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null; dragScrollY = null; }

async function openView() {
  if (overlay) { closeView(); return; }   // toggle
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; overflow:auto;' +
    'background:#080a10; padding:24px; box-sizing:border-box;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeView(); });
  // Edge auto-scroll during a drag (drag events bubble from the chips).
  overlay.addEventListener('dragstart', startDragScroll);
  overlay.addEventListener('dragover', e => { dragScrollY = e.clientY; });
  overlay.addEventListener('dragend', stopDragScroll);

  const page = document.createElement('div');
  page.style.cssText = 'max-width:1900px; margin:0 auto; color:#c9d1d9;';
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

  let colonies, missions;
  try {
    const [planetList, outpostData, missionsData, meData] = await Promise.all([
      jget('/api/planets'), jget('/api/outposts').catch(() => ({})), jget('/api/fleet/missions').catch(() => ({ missions: [] })), jget('/api/auth/me').catch(() => ({})),
    ]);
    const planets = (planetList.planets || []).filter(p => p.id != null);
    const details = await Promise.all(planets.map(p => Promise.all([
      jget(`/api/planets/${p.id}`).catch(() => null),
      jget(`/api/planets/${p.id}/fleet`).catch(() => ({ fleet: [] })),
    ])));
    missions = missionsData.missions || [];
    const outposts = outpostData.outposts || (Array.isArray(outpostData) ? outpostData : []);

    // Colonized moons have their own /api/moons/{id} endpoints; find their ids via
    // the galaxy view of my planets' systems (mine = matching userId).
    const myId = meData.user && (meData.user.id ?? meData.user.userId);
    const sysIds = [...new Set(planets.map(p => p.systemId).filter(x => x != null))];
    const sysData = await Promise.all(sysIds.map(s => jget(`/api/galaxy/systems/${s}/planets`).catch(() => ({}))));
    const moonIds = [];
    for (const sd of sysData) for (const mo of (sd.moons || [])) if (mo.userId != null && mo.userId === myId) moonIds.push(mo.id);
    const moonDetails = await Promise.all(moonIds.map(id => Promise.all([
      jget(`/api/moons/${id}`).catch(() => null),
      jget(`/api/moons/${id}/fleet`).catch(() => ({ fleet: [] })),
    ])));
    const moonCol = moonIds.map((id, i) => {
      const [det, fl] = moonDetails[i];
      const res = (det && det.moon) || {};
      return { id, systemId: res.systemId, kind: 'Moon', name: res.name || `Moon #${id}`, res, ships: (fl.fleet || []) };
    });

    colonies = planets.map((p, i) => {
      const [detail, fleet] = details[i];
      const res = (detail && detail.planet) || p;
      return { id: p.id, systemId: p.systemId, kind: 'Planet', name: p.name, res, ships: (fleet.fleet || []) };
    }).concat(moonCol,
      outposts.map(o => ({ id: o.id, systemId: o.systemId, kind: 'Outpost', name: o.name || `Outpost #${o.id}`, res: o, ships: null, deployed: o.deployedShipCount })));
  } catch (e) {
    page.querySelector('.lv-sub').textContent = `Error: ${e.message}`;
    return;
  }
  if (!overlay) return;
  render(page, colonies, missions);
  applyPendingDeliver();
}

// Prefill a planet→planet resource delivery, e.g. from the building-upgrade
// planner. `resByCargoKey` is { cargoKey: amount } (snake keys, as dispatch
// wants). Opens the Quartermaster and stages a delivery from the planet holding
// the most of what's needed, capped to that source's stock (user can adjust).
let pendingDeliver = null;
window.__nxDeliverToPlanet = async (targetPlanetId, resByCargoKey) => {
  pendingDeliver = { targetPlanetId, resByCargoKey };
  if (!overlay) await openView(); else applyPendingDeliver();
};
async function applyPendingDeliver() {
  if (!pendingDeliver || !allColonies.length) return;
  const { targetPlanetId, resByCargoKey } = pendingDeliver;
  pendingDeliver = null;
  const target = allColonies.find(c => c.id === targetPlanetId && c.kind === 'Planet');
  if (!target) return;
  const needByK = {};
  for (const [cargo, amt] of Object.entries(resByCargoKey)) {
    const r = RESOURCES.find(x => x.cargo === cargo);
    if (r && amt > 0) needByK[r.k] = amt;
  }
  const needKeys = Object.keys(needByK);
  if (!needKeys.length) return;

  const cands = allColonies.filter(c => c.kind === 'Planet' && c.id !== targetPlanetId);
  if (!cands.length) return;

  // Distance target↔candidate from cached galaxy-map coords (background).
  const sysIds = [...new Set([target.systemId, ...cands.map(c => c.systemId)].filter(x => x != null))];
  let coords = {};
  try { coords = (await ext.runtime.sendMessage({ type: 'GET_SYSTEM_COORDS', ids: sysIds })) || {}; } catch { coords = {}; }
  const distTo = c => {
    const a = coords[target.systemId], b = coords[c.systemId];
    return (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : Infinity;
  };
  const sumHave = c => needKeys.reduce((s, k) => s + Math.min(needByK[k], (c.res && c.res[k]) || 0), 0);
  const covers = c => needKeys.every(k => ((c.res && c.res[k]) || 0) >= needByK[k]);

  // Prefer the NEAREST planet that fully covers the need. If none fully covers,
  // fall back to the planet holding the most of it (tie-break by distance).
  const full = cands.filter(covers);
  const src = full.length
    ? full.sort((a, b) => (distTo(a) - distTo(b)) || (sumHave(b) - sumHave(a)))[0]
    : cands.sort((a, b) => (sumHave(b) - sumHave(a)) || (distTo(a) - distTo(b)))[0];
  if (!src) return;
  builder = { src, target, mode: 'resource', res: {}, ships: {}, cargoManual: null };
  for (const [k, need] of Object.entries(needByK)) {
    const avail = Math.floor((src.res && src.res[k]) || 0);
    builder.res[k] = { amount: Math.min(need, avail), max: avail };
  }
  renderBuilder();
  if (builderEl) builderEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    chip.innerHTML = `<b style="color:#e6edf3;">${fmt(s.qty)}</b>&times; <span style="color:#9aa4b2;">${esc(s.name)}</span>`;
    chips.appendChild(chip);
  }
  sec.appendChild(chips);
  return sec;
}

function render(page, colonies, missions = []) {
  page.querySelector('.lv-sub').innerHTML =
    `${colonies.length} colonies (${colonies.filter(c => c.kind === 'Planet').length} planets, ${colonies.filter(c => c.kind === 'Moon').length} moons, ${colonies.filter(c => c.kind === 'Outpost').length} outposts)` +
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

  // ── Colony columns: moons (left) · planets (centre) · outposts (right) ──
  const makeCol = (label, list, opts) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = opts.grow ? 'flex:1; min-width:0;' : `flex:0 0 ${opts.width};`;
    const lbl = document.createElement('div');
    lbl.style.cssText = 'color:#8b949e; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 8px;';
    lbl.textContent = `${label} (${list.length})`;
    wrap.appendChild(lbl);
    const inner = document.createElement('div');
    inner.style.cssText = opts.grow
      ? 'display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:14px;'
      : 'display:flex; flex-direction:column; gap:14px;';
    for (const c of list) inner.appendChild(colonyCard(c));
    wrap.appendChild(inner);
    return wrap;
  };
  const moons = colonies.filter(c => c.kind === 'Moon');
  const outposts = colonies.filter(c => c.kind === 'Outpost');
  const cols = document.createElement('div');
  cols.style.cssText = 'display:flex; gap:28px; align-items:flex-start;';
  if (moons.length) cols.appendChild(makeCol('Moons', moons, { width: '235px' }));
  cols.appendChild(makeCol('Planets', colonies.filter(c => c.kind === 'Planet'), { grow: true }));
  if (outposts.length) cols.appendChild(makeCol('Outposts', outposts, { width: '235px' }));
  page.appendChild(cols);
}

// Which source→target moves are supported. Outpost/moon export only to a planet;
// a planet can send to a planet, outpost, or moon.
function validCombo(item, tgt) {
  const sk = item.src.kind, tk = tgt.kind;
  if (sk === 'Outpost') return item.type === 'resource' && tk === 'Planet';   // collect
  if (sk === 'Moon') return tk === 'Planet';                                   // recall / transfer
  return tk === 'Planet' || tk === 'Outpost' || tk === 'Moon';                 // planet → anywhere
}

function colonyCard(c) {
  const card = document.createElement('div');
  card.style.cssText = 'background:#0d1117; border:1px solid #21262d; border-radius:10px; padding:12px 14px;';
  // Drop target: accept only valid source→target combos (outpost/moon exports go
  // to a planet; planets export anywhere).
  const accepts = () => dragItem && dragItem.src !== c && c.id != null && validCombo(dragItem, c);
  card.addEventListener('dragover', e => { if (accepts()) { e.preventDefault(); card.style.outline = '2px dashed #58a6ff'; } });
  card.addEventListener('dragleave', () => { card.style.outline = ''; });
  card.addEventListener('drop', e => {
    e.preventDefault(); card.style.outline = '';
    const it = dragItem; dragItem = null;
    if (!it || it.src === c || c.id == null || !validCombo(it, c)) return;
    if (it.type === 'resource' && it.src.kind === 'Outpost') { stageCollectResource(it.src, c, it.resKey); return; }
    stageTransfer(it, c);
  });
  const head = document.createElement('div');
  head.style.cssText = 'display:flex; align-items:baseline; gap:8px; margin-bottom:8px;';
  head.innerHTML = `<b style="color:#e6edf3;">${esc(c.name)}</b>` +
    `<span style="color:#8b949e; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em;">${c.kind}</span>`;
  // Outposts extract exactly one resource at a time — whichever `{k}Rate`
  // field is nonzero (mirrors its asteroid field's fieldType).
  if (c.kind === 'Outpost' && c.res) {
    const mining = RESOURCES.find(r => (c.res[`${r.k}Rate`] || 0) > 0);
    if (mining) {
      const badge = document.createElement('span');
      badge.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-left:auto; color:#8b949e; font-size:0.75rem;';
      badge.title = `Mining ${mining.label}`;
      badge.innerHTML = `<img src="${IMG}/${mining.icon}" width="13" height="13" style="width:13px;height:13px;">${fmt(c.res[`${mining.k}Rate`])}/h`;
      head.appendChild(badge);
    }
  }
  card.appendChild(head);

  // Resources
  const resWrap = document.createElement('div');
  resWrap.style.cssText = 'display:flex; flex-direction:column; gap:3px; font-size:0.82rem;';
  for (const r of RESOURCES) {
    const v = c.res ? c.res[r.k] : 0;
    if (!v) continue;
    const cap = storageCap(c, r.k);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:3px 5px; border-radius:6px; border:1px solid transparent;';
    row.innerHTML = `<img src="${IMG}/${r.icon}" width="15" height="15" style="width:15px;height:15px;" alt="">` +
      `<span style="color:#9aa4b2; flex:1;">${r.label}</span>` +
      `<span style="color:#e6edf3;">${fmt(v)}${cap ? `<span style="color:#6e7681;"> / ${fmt(cap)}</span>` : ''}</span>`;
    // Draggable: planet resources → deliver/supply anywhere; outpost resources →
    // drop on a planet to collect them there.
    if (c.id != null) {
      row.draggable = true; row.style.cursor = 'grab';
      row.title = c.kind === 'Outpost' ? 'Drag to a planet to collect' : c.kind === 'Moon' ? 'Drag to a planet to transfer' : 'Drag to another colony to send';
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
      sp.innerHTML = `<b style="color:#e6edf3;">${fmt(f.quantity)}</b>&times; <span style="color:#9aa4b2;">${esc(nm)}</span>`;
      // Draggable → relocate these ships to another colony.
      const avail = (f.quantity || 0) - (f.damagedQuantity || 0);
      if (c.id != null && avail > 0) {
        sp.draggable = true; sp.style.cursor = 'grab'; sp.title = c.kind === 'Moon' ? 'Drag to a planet to recall' : 'Drag to another colony to relocate';
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

// Dedicated cargo haulers (not combat/mining ships). tanker/ore_freighter also
// restrict which resources they carry (definition.allowedCargo).
const CARGO_KEYS = new Set(['freighter', 'transport_shuttle', 'bulk_carrier', 'ore_freighter', 'tanker']);
// Cargo haulers on a colony (effective capacity). If `wantKeys` (snake cargo
// keys being moved) is given, exclude haulers that can't carry all of them.
async function cargoShipsOf(colony, wantKeys) {
  const ctx = await cargoContext();
  return ((colony && colony.ships) || []).map(f => {
    const def = f.definition || {};
    return { shipDefId: f.shipDefId, key: def.key, name: def.name || ('#' + f.shipDefId), cap: effCap(def, ctx), avail: (f.quantity || 0) - (f.damagedQuantity || 0), allowed: def.allowedCargo || null };
  }).filter(s => CARGO_KEYS.has(s.key) && s.cap > 0 && s.avail > 0 &&
    (!wantKeys || !wantKeys.length || !s.allowed || wantKeys.some(k => s.allowed.includes(k))));
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
function numInput(value) {
  // Text (not number) so there are no spinner arrows; guard to positive integers.
  const i = document.createElement('input');
  i.type = 'text'; i.inputMode = 'numeric';
  i.value = String(value);
  i.style.cssText = 'width:76px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:4px 7px; border-radius:6px; text-align:right;';
  i.addEventListener('input', () => { const c = i.value.replace(/[^\d]/g, ''); if (c !== i.value) i.value = c; });
  return i;
}
// Wrap a numInput with −/+ steppers and a Max button. Buttons set the value and
// fire input+change so the field's existing handlers re-run. `max` (when set)
// caps the value and enables the Max button.
function withStepper(inp, max) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; align-items:center; gap:4px;';
  const mkBtn = txt => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.style.cssText = 'background:#21262d; border:1px solid #30363d; color:#e6edf3; border-radius:6px; padding:4px 8px; cursor:pointer; line-height:1;';
    return b;
  };
  const commit = v => {
    v = Math.max(0, Math.floor(v || 0));
    if (max != null && isFinite(max)) v = Math.min(max, v);
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const cur = () => parseInt(inp.value, 10) || 0;
  const minus = mkBtn('−'); minus.onclick = () => commit(cur() - 1);
  const plus = mkBtn('+'); plus.onclick = () => commit(cur() + 1);
  wrap.append(minus, inp, plus);
  if (max != null && isFinite(max)) { const mx = mkBtn('Max'); mx.onclick = () => commit(max); wrap.append(mx); }
  return wrap;
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
      `<span style="color:#f0883e;">${srcPlanet ? esc(srcPlanet.name) : '?'} → ${esc(b.outpost.name)} → back</span>`;
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
      cb.addEventListener('change', () => { if (cb.checked) b.filter.add(r.k); else b.filter.delete(r.k); b.cargoManual = {}; renderBuilder(); });
      lbl.append(cb, Object.assign(document.createElement('img'), { src: `${IMG}/${r.icon}`, width: 14, height: 14 }), document.createTextNode(`${r.label} (${fmt(have)})`));
      typeWrap.appendChild(lbl);
    }
    box.appendChild(typeWrap);
    // Transport ships from the source planet (only haulers that can carry the
    // selected resource types).
    const cargoShips = await cargoShipsOf(srcPlanet, [...b.filter].map(k => RES_BY_K[k].cargo));
    const availableOf = () => [...b.filter].reduce((s, k) => s + ((b.outpost.res && b.outpost.res[k]) || 0), 0);
    const availAll = () => Object.fromEntries([...b.filter].map(k => [RES_BY_K[k].cargo, (b.outpost.res && b.outpost.res[k]) || 0]));
    // Amounts to plan for: full availability, or capped to the target (largest first).
    const collectAmounts = () => {
      const av = availAll();
      if (!b.target) return av;
      let left = b.target; const out = {};
      for (const [ck, v] of Object.entries(av).sort((a, b2) => b2[1] - a[1])) { const t = Math.min(v, left); out[ck] = t; left -= t; }
      return out;
    };
    // Target amount: the API takes no amount (it fills ships to capacity), but we
    // can auto-plan the transport ships to carry ~this much.
    const targetInp = numInput(b.target || '', null);
    targetInp.placeholder = 'auto (fill ships)';
    targetInp.addEventListener('change', () => {
      b.target = Math.min(availableOf(), Math.max(0, parseInt(targetInp.value, 10) || 0));
      b.cargoManual = planFleetMulti(collectAmounts(), cargoShips).plan;
      renderBuilder();
    });
    box.appendChild(fieldRow('<span style="color:#9aa4b2;">Target amount (auto-plan ships)</span>', withStepper(targetInp, availableOf())));
    const cw = document.createElement('div'); cw.style.cssText = 'border-top:1px solid #21262d; margin-top:6px; padding-top:8px;';
    cw.innerHTML = '<div style="color:#8b949e; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Transport ships</div>';
    box.appendChild(cw);
    const capLine = document.createElement('div'); capLine.style.cssText = 'font-size:0.82rem; margin-top:4px;';
    const updateSend = () => {
      const avail = availableOf();
      const cap = cargoShips.reduce((s, cs) => s + (b.cargoManual[cs.shipDefId] || 0) * cs.cap, 0);
      // Resource-aware: a ship can only carry resources its allowedCargo permits.
      const collected = avail - residualAfter(b.cargoManual, availAll(), cargoShips);
      const pct = avail > 0 ? Math.min(100, Math.round(collected / avail * 100)) : 0;
      capLine.innerHTML = `Available <b style="color:#e6edf3">${fmt(avail)}</b> · capacity <b style="color:#e6edf3">${fmt(cap)}</b> · ` +
        `~<b style="color:${collected >= avail && avail > 0 ? '#56d364' : '#e3b341'}">${pct}%</b> collected (≈${fmt(collected)})`;
      send.disabled = !getShips().length || b.filter.size === 0;
      refreshFuel();
    };
    for (const cs of cargoShips) {
      const inp = numInput(b.cargoManual[cs.shipDefId] || 0, cs.avail);
      inp.addEventListener('input', () => { b.cargoManual[cs.shipDefId] = Math.min(cs.avail, Math.max(0, parseInt(inp.value, 10) || 0)); updateSend(); });
      cw.appendChild(fieldRow(`${esc(cs.name)} <span style="color:#6e7681;">/ ${fmt(cs.avail)} · ${fmt(cs.cap)} ea</span>`, withStepper(inp, cs.avail)));
    }
    if (!cargoShips.length) cw.innerHTML += '<span style="color:#ff7b72; font-size:0.82rem;">No cargo ships on this planet.</span>';
    cw.appendChild(capLine);
    getShips = () => cargoShips.map(cs => ({ shipDefId: cs.shipDefId, quantity: b.cargoManual[cs.shipDefId] || 0 })).filter(s => s.quantity > 0);
    fuelSrc = b.srcPlanetId; fuelSys = b.outpost.systemId;
    box.append(fuelLine);
    updateSend();
  } else if (b.mode === 'resource') {
    const rVerb = b.src.kind === 'Moon' ? 'Transfer resources' : b.target.kind === 'Moon' ? 'Send resources' : toOutpost ? 'Supply outpost' : 'Deliver resources';
    head.innerHTML = `<b style="color:#e6edf3;">${rVerb}</b>` +
      `<span style="color:#f0883e;">${esc(b.src.name)} → ${esc(b.target.name)}</span>` +
      `<span style="color:#6e7681; font-size:0.8rem; margin-left:6px;">drag more onto ${esc(b.target.name)} to add</span>`;
    // Mission switch (planet → planet only): deliver = haulers drop cargo and
    // return; transfer = haulers stay at the destination. Other endpoints (moon/
    // outpost) don't take this choice.
    if (b.src.kind === 'Planet' && b.target.kind === 'Planet') {
      if (!b.deliverMode) b.deliverMode = 'deliver';
      const seg = document.createElement('div');
      seg.style.cssText = 'display:inline-flex; border:1px solid #30363d; border-radius:7px; overflow:hidden;';
      const mk = (mode, label, title) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = label; btn.title = title;
        btn.__paint = () => { btn.style.cssText = `padding:4px 12px; border:none; cursor:pointer; font-size:0.85rem; ${b.deliverMode === mode ? 'background:#1f6feb; color:#fff;' : 'background:#161b22; color:#9aa4b2;'}`; };
        btn.__paint();
        btn.onclick = () => { b.deliverMode = mode; seg.querySelectorAll('button').forEach(x => x.__paint()); };
        return btn;
      };
      seg.append(mk('deliver', 'Deliver', 'Haulers drop the cargo and return'),
                 mk('transfer', 'Transfer', 'Haulers stay at the destination'));
      box.appendChild(fieldRow('<span style="color:#9aa4b2;">Mission</span>', seg));
    }
    // Source picker — swap which planet the resources ship from (defaults to the
    // auto-chosen one). Changing it re-caps each amount to the new stock and
    // re-plans ships, since a different planet has different haulers.
    const srcOpts = allColonies.filter(c => c.id !== b.target.id && c.kind !== 'Outpost' && validCombo({ type: 'resource', src: c }, b.target));
    if (srcOpts.length > 1) {
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:4px 7px; border-radius:6px;';
      for (const c of srcOpts) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; if (c.id === b.src.id) o.selected = true; sel.appendChild(o); }
      sel.addEventListener('change', () => {
        const ns = srcOpts.find(c => c.id === Number(sel.value)); if (!ns) return;
        b.src = ns;
        for (const [rk, ent] of Object.entries(b.res)) { ent.max = Math.floor((ns.res && ns.res[rk]) || 0); ent.amount = Math.min(ent.amount, ent.max); }
        b.cargoManual = null;
        renderBuilder();
      });
      box.appendChild(fieldRow('<span style="color:#9aa4b2;">From planet</span>', sel));
    }
    for (const [k, ent] of Object.entries(b.res)) {
      const r = RES_BY_K[k];
      const inp = numInput(ent.amount, ent.max);
      inp.addEventListener('input', () => { ent.amount = Math.min(ent.max, Math.max(0, parseInt(inp.value, 10) || 0)); refreshCargo(); });
      // Re-plan the fleet to match the new amount (on blur/enter, so focus isn't lost mid-typing).
      inp.addEventListener('change', () => { b.cargoManual = planFleetMulti(amountsOf(), cargoShips).plan; renderBuilder(); });
      box.appendChild(fieldRow(`<img src="${IMG}/${r.icon}" width="15" height="15" style="width:15px;height:15px;"> ${r.label} <span style="color:#6e7681;">/ ${fmt(ent.max)}</span>`,
        withStepper(inp, ent.max), () => { delete b.res[k]; b.cargoManual = null; if (!Object.keys(b.res).length) builder = null; renderBuilder(); }));
    }
    const cargoShips = await cargoShipsOf(b.src, Object.keys(b.res).map(k => RES_BY_K[k].cargo));
    const cw = document.createElement('div'); cw.style.cssText = 'border-top:1px solid #21262d; margin-top:10px; padding-top:8px;';
    cw.innerHTML = '<div style="color:#8b949e; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Transport ships</div>';
    box.appendChild(cw);
    const capLine = document.createElement('div'); capLine.style.cssText = 'font-size:0.82rem; margin-top:4px;';
    const amountsOf = () => Object.fromEntries(Object.entries(b.res).map(([k, e]) => [RES_BY_K[k].cargo, e.amount]));
    const totalCargo = () => Object.values(b.res).reduce((s, e) => s + e.amount, 0);
    if (b.cargoManual == null) b.cargoManual = planFleetMulti(amountsOf(), cargoShips).plan;
    const refreshCargo = () => {
      const need = totalCargo();
      const short = residualAfter(b.cargoManual, amountsOf(), cargoShips);
      capLine.innerHTML = `Carrying <b style="color:${short <= 0 ? '#56d364' : '#ff7b72'}">${fmt(need - short)}</b> / ${fmt(need)}` +
        (short > 0 ? ` <span style="color:#ff7b72;">· short ${fmt(short)}</span>` : '');
      send.disabled = need <= 0 || short > 0;
      refreshFuel();
    };
    for (const cs of cargoShips) {
      const inp = numInput(b.cargoManual[cs.shipDefId] || 0, cs.avail);
      inp.addEventListener('input', () => { b.cargoManual[cs.shipDefId] = Math.min(cs.avail, Math.max(0, parseInt(inp.value, 10) || 0)); refreshCargo(); });
      cw.appendChild(fieldRow(`${esc(cs.name)} <span style="color:#6e7681;">/ ${fmt(cs.avail)} · ${fmt(cs.cap)} ea</span>`, withStepper(inp, cs.avail)));
    }
    if (!cargoShips.length) cw.innerHTML += '<span style="color:#ff7b72; font-size:0.82rem;">No cargo ships on this colony.</span>';
    cw.appendChild(capLine);
    getShips = () => cargoShips.map(cs => ({ shipDefId: cs.shipDefId, quantity: b.cargoManual[cs.shipDefId] || 0 })).filter(s => s.quantity > 0);
    fuelSrc = b.src.id; fuelSys = b.target.systemId;
    box.append(fuelLine);
    refreshCargo();
  } else {   // ship
    const sVerb = b.src.kind === 'Moon' ? 'Recall ships' : b.target.kind === 'Moon' ? 'Send ships' : toOutpost ? 'Deploy ships' : 'Relocate ships';
    head.innerHTML = `<b style="color:#e6edf3;">${sVerb}</b>` +
      `<span style="color:#f0883e;">${esc(b.src.name)} → ${esc(b.target.name)}</span>` +
      `<span style="color:#6e7681; font-size:0.8rem; margin-left:6px;">drag more onto ${esc(b.target.name)} to add</span>`;
    for (const [id, ent] of Object.entries(b.ships)) {
      const inp = numInput(ent.qty, ent.max);
      inp.addEventListener('input', () => { ent.qty = Math.min(ent.max, Math.max(0, parseInt(inp.value, 10) || 0)); refreshFuel(); send.disabled = !getShips().length; });
      box.appendChild(fieldRow(`${esc(ent.name)} <span style="color:#6e7681;">/ ${fmt(ent.max)}</span>`, withStepper(inp, ent.max),
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

  // Endpoint + body per mode/source/target (payloads match the game's own requests).
  function sendSpec() {
    const ships = getShips();
    if (b.mode === 'collect')
      return { path: `/api/outposts/${b.outpost.id}/collect`, body: { sourcePlanetId: b.srcPlanetId, ships, resourceFilter: [...b.filter].map(k => RES_BY_K[k].cargo) } };
    const src = b.src, tgt = b.target;
    const resources = b.mode === 'resource'
      ? Object.fromEntries(Object.entries(b.res).filter(([, e]) => e.amount > 0).map(([k, e]) => [RES_BY_K[k].cargo, e.amount]))
      : {};
    if (src.kind === 'Moon')   // moon → planet
      return b.mode === 'resource'
        ? { path: `/api/moons/${src.id}/dispatch`, body: { missionType: 'transfer', targetPlanetId: tgt.id, ships, cargo: resources } }
        : { path: `/api/moons/${src.id}/recall`, body: { targetPlanetId: tgt.id, ships } };
    if (tgt.kind === 'Moon')   // planet → moon (send handles resources + ships)
      return { path: `/api/moons/${tgt.id}/send`, body: { sourcePlanetId: src.id, ships, cargo: resources } };
    if (tgt.kind === 'Outpost')
      return b.mode === 'resource'
        ? { path: `/api/outposts/${tgt.id}/supply`, body: { sourcePlanetId: src.id, ships, resources } }
        : { path: `/api/outposts/${tgt.id}/garrison`, body: { sourcePlanetId: src.id, ships } };
    return b.mode === 'resource'   // planet → planet
      ? { path: '/api/fleet/dispatch', body: { sourcePlanetId: src.id, targetPlanetId: tgt.id, missionType: b.deliverMode || 'deliver', ships, cargo: resources } }
      : { path: '/api/fleet/dispatch', body: { sourcePlanetId: src.id, targetPlanetId: tgt.id, missionType: 'transfer', ships, cargo: {} } };
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
