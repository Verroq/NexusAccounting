// Empire View: a body-level overlay (opened from the "Empire View" sidebar link
// added by sidebar-inject.js) that shows a columnar per-planet summary —
// workforce, resource-building levels, and production per resource, plus a Total
// column across all planets.
//
// Rendered on the game page, so it reuses the game's own CSS classes
// (`research-page`, `res-hero`, `res-stat-chip`) for a native look. The overlay
// lives in <body>, outside `.game-content`, so React re-renders never wipe it.
//
// Data: /api/planets (list) + /api/planets/{id} (detail) fetched same-origin —
// the nexus_token cookie rides along automatically, no background messaging.
//
// IIFE + re-run guard: Firefox can inject a content script twice into the same
// isolated world (extension reload into an open tab); top-level `const`s would
// then throw "redeclaration of const" and abort the whole script.
if (!window.__nxEmpireView) {
window.__nxEmpireView = true;
(function () {
const IMG = '/images/resources';
// resourceKey → { breakdownKey, building def key (level), label, icon }
const RESOURCES = [
  { k: 'ore',         bd: 'ore',         bld: 'ore_mine',           label: 'Ore Mine',          icon: 'ore.webp' },
  { k: 'silicates',   bd: 'silicates',   bld: 'silicate_mine',      label: 'Silicate Mine',     icon: 'silicates.webp' },
  { k: 'hydrogen',    bd: 'hydrogen',    bld: 'hydrogen_processor', label: 'Hydrogen Processor',icon: 'hydrogen.webp' },
  { k: 'alloys',      bd: 'alloys',      bld: 'alloy_foundry',      label: 'Alloy Foundry',     icon: 'alloys.webp' },
  { k: 'cryoIce',     bd: 'cryoIce',     bld: null,                 label: 'Cryo-Ice',          icon: 'cryo_ice.webp' },
  { k: 'quantumDust', bd: 'quantumDust', bld: null,                 label: 'Quantum Dust',      icon: 'quantum_dust.webp' },
  { k: 'plasmaCore',  bd: 'plasmaCore',  bld: null,                 label: 'Plasma Core',       icon: 'plasma_core.webp' },
  { k: 'bioExtract',  bd: 'bioExtract',  bld: null,                 label: 'Bio-Extract',       icon: 'bio_extract.webp' },
  { k: 'darkMatter',  bd: 'darkMatter',  bld: null,                 label: 'Dark Matter',       icon: 'dark_matter.webp' },
  { k: 'antimatter',  bd: 'antimatter',  bld: null,                 label: 'Antimatter',        icon: 'antimatter.webp' },
];

const fmt = n => Math.round(n || 0).toLocaleString();

function fmtCountdown(ms) {
  if (ms <= 0) return 'done';
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${p(m)}m`;
  if (m) return `${m}m ${p(sec)}s`;
  return `${sec}s`;
}

// Live countdown registry: each render repopulates it; a 1s interval ticks them
// while the overlay is open (cleared on close).
let timers = [];
let tickHandle = null;
function timerSpan(endsAt) {
  const span = document.createElement('span');
  span.style.color = '#f0883e';
  const upd = () => { span.textContent = fmtCountdown(new Date(endsAt) - Date.now()); };
  upd();
  timers.push(upd);
  return span;
}

async function jget(path) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// Ship-build queue items across both yards (planetary "Shipyard" + "Orbital"
// Shipyard). Item: { shipName, quantity, completed, isRepair, operation, endsAt,
// status }. qty shown is remaining (quantity − completed).
function shipQueueItems(shipyard) {
  const pull = (arr, yard) => (arr || []).map(it => ({
    yard,
    name: it.shipName || it.shipKey || 'Ship',
    qty: Math.max(0, (it.quantity || 0) - (it.completed || 0)) || it.quantity || 1,
    repair: it.isRepair || it.operation === 'repair',
    ends: it.endsAt || null,
  }));
  return [...pull(shipyard.planetaryQueueAll, 'Shipyard'), ...pull(shipyard.orbitalQueueAll, 'Orbital')];
}

// One planet's bundle (detail + research + shipyard) → flat model for the table.
function modelOf(bundle) {
  const { detail, research, shipyard, listP } = bundle;
  if (detail.error) return { name: listP.name, error: detail.error };
  const pl = detail.planet;
  const byKey = {};
  for (const b of (detail.buildings || [])) byKey[b.definition.key] = b;
  const bd = (detail.productionBreakdown && detail.productionBreakdown.breakdown) || {};
  return {
    id: pl.id,
    name: pl.name,
    planetType: pl.planetType || null,
    population: pl.population, maxPopulation: pl.maxPopulation,
    growth: pl.populationGrowthRate,
    energyProduced: pl.energyProduced, energyConsumed: pl.energyConsumed,
    workers: (detail.buildings || []).reduce((s, b) => s + (b.assignedWorkers || 0), 0),
    level: k => (k && byKey[k] ? byKey[k].level : null),
    prod: bk => (bd[bk] ? bd[bk].final || 0 : 0),
    stored: k => pl[k] || 0,
    storageCap: k => (pl[`${k}Storage`] != null ? pl[`${k}Storage`] : pl.rareResourceStorage) || 0,
    slots: { used: pl.usedBuildingSlots, max: pl.maxBuildingSlots },
    buildQueue: { count: detail.buildQueueCount, max: detail.buildQueueMax },
    // Research is account-global but each active entry names the planet running it.
    researching: ((research && research.activeResearches) || [])
      .filter(r => r.planetId === pl.id && r.status === 'in_progress' && r.endsAt),
    construction: (detail.buildings || [])
      .filter(b => b.isUpgrading && b.upgradeEndsAt)
      .map(b => ({ name: b.definition.name, level: b.level, ends: b.upgradeEndsAt })),
    ships: shipyard ? shipQueueItems(shipyard) : [],
  };
}

let overlay = null;

function closeEmpire() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  timers = [];
  if (overlay) { overlay.remove(); overlay = null; }
}

async function openEmpire() {
  if (overlay) { closeEmpire(); return; }   // toggle
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; overflow:auto;' +
    'background:#080a10; padding:24px; box-sizing:border-box;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeEmpire(); });

  const page = document.createElement('div');
  page.className = 'research-page';
  page.style.cssText = 'max-width:1200px; margin:0 auto;';
  overlay.appendChild(page);
  document.body.appendChild(overlay);

  // Self-styled banner (no .res-hero/.res-hero-main game classes — those pull in
  // the game's hero layout, which rendered a second thumbnail of the image).
  page.innerHTML = `
    <section style="position:relative; overflow:hidden; border-radius:10px; height:150px; margin-bottom:14px;">
      <img src="/api/images/page-heroes/research.webp" alt=""
        style="width:100%; height:100%; object-fit:cover; object-position:center 40%; display:block; opacity:0.85;">
      <div style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 24px;
        background:linear-gradient(90deg, rgba(8,10,16,0.85) 0%, rgba(8,10,16,0.35) 60%, rgba(8,10,16,0) 100%);">
        <h1 style="margin:0; font-size:1.9rem; color:#e6edf3;">Empire View</h1>
        <p class="res-hero-sub" style="margin:5px 0 0; color:#9aa4b2; font-size:0.9rem;">Loading planets…</p>
      </div>
    </section>`;

  // Close (Esc + button).
  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = 'Close (Esc)';
  close.style.cssText = 'position:fixed; top:16px; right:20px; z-index:1; background:transparent;' +
    'border:none; color:#8b949e; font-size:1.6rem; cursor:pointer; line-height:1;';
  close.addEventListener('click', closeEmpire);
  overlay.appendChild(close);
  const onKey = e => { if (e.key === 'Escape') { closeEmpire(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);

  let planets;
  try {
    const list = (await jget('/api/planets')).planets || [];
    const bundles = await Promise.all(list.map(async p => {
      const [detail, research, shipyard] = await Promise.all([
        jget(`/api/planets/${p.id}`).catch(e => ({ error: e.message })),
        jget(`/api/research?planetId=${p.id}`).catch(() => ({})),
        jget(`/api/planets/${p.id}/shipyard`).catch(() => ({})),
      ]);
      return { detail, research, shipyard, listP: p };
    }));
    planets = bundles.map(modelOf);
  } catch (e) {
    page.querySelector('.res-hero-sub').textContent = `Error: ${e.message}`;
    return;
  }
  if (!overlay) return;   // closed while loading
  renderTable(page, planets);
  tickHandle = setInterval(() => { for (const upd of timers) upd(); }, 1000);
}

function renderTable(page, planets) {
  timers = [];   // fresh render → rebuild the timer registry
  page.querySelector('.res-hero-sub').textContent =
    `${planets.length} planet${planets.length === 1 ? '' : 's'}`;

  const table = document.createElement('table');
  table.className = 'nx-empire-table';
  table.style.cssText = 'width:100%; border-collapse:collapse; margin-top:16px; font-size:0.9rem;';

  const cell = (tag, txt, css) => {
    const el = document.createElement(tag);
    if (txt != null) el.textContent = txt;
    if (css) el.style.cssText = css;
    return el;
  };
  const thBase = 'padding:8px 12px; text-align:right; border-bottom:1px solid #30363d;';
  const tdBase = 'padding:7px 12px; text-align:right; border-bottom:1px solid #21262d;';
  const labelCss = 'padding:7px 12px; text-align:left; border-bottom:1px solid #21262d; color:#c9d1d9;';

  // Header: metric | planet names… | Total
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.appendChild(cell('th', '', thBase + 'text-align:left;'));
  for (const p of planets) hr.appendChild(cell('th', p.name, thBase + 'color:#e6edf3;'));
  hr.appendChild(cell('th', 'Total', thBase + 'color:#f0883e; font-weight:700;'));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  // Section divider row.
  const section = title => {
    const tr = document.createElement('tr');
    const td = cell('td', title, 'padding:12px 12px 6px; text-align:left; color:#8b949e;' +
      'font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase;');
    td.colSpan = planets.length + 2;
    tr.appendChild(td);
    tbody.appendChild(tr);
  };

  // A metric row: label + per-planet cell (via valueFn) + total cell (via totalFn).
  // valueFn/totalFn return a string or a DOM node.
  const row = (label, valueFn, totalFn) => {
    const tr = document.createElement('tr');
    const ltd = cell('td', null, labelCss);
    if (label instanceof Node) ltd.appendChild(label); else ltd.textContent = label;
    tr.appendChild(ltd);
    for (const p of planets) {
      const td = cell('td', null, tdBase);
      if (p.error) { td.textContent = '—'; td.title = p.error; td.style.color = '#ff7b72'; }
      else { const v = valueFn(p); if (v instanceof Node) td.appendChild(v); else td.textContent = v; }
      tr.appendChild(td);
    }
    const tot = cell('td', null, tdBase + 'color:#f0883e; font-weight:600;');
    const tv = totalFn ? totalFn(planets.filter(p => !p.error)) : '—';
    if (tv instanceof Node) tot.appendChild(tv); else tot.textContent = tv;
    tr.appendChild(tot);
    tbody.appendChild(tr);
  };

  const sum = (arr, f) => arr.reduce((s, p) => s + (f(p) || 0), 0);

  // Stacked multi-entry cell (research / construction / ships). `build(e)` → node.
  const entriesCell = (entries, build) => {
    if (!entries.length) return '—';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; text-align:right;';
    for (const e of entries) wrap.appendChild(build(e));
    return wrap;
  };
  const entryLine = (text, endsAt) => {
    const d = document.createElement('div');
    const t = document.createElement('span'); t.textContent = text + ' ';
    d.appendChild(t);
    if (endsAt) d.appendChild(timerSpan(endsAt));
    return d;
  };

  // ── Workforce ──
  section('Workforce');
  row('Population',
    p => `${fmt(p.population)} / ${fmt(p.maxPopulation)}`,
    ps => `${fmt(sum(ps, p => p.population))} / ${fmt(sum(ps, p => p.maxPopulation))}`);
  row('Growth /h', p => `+${fmt(p.growth)}`, ps => `+${fmt(sum(ps, p => p.growth))}`);
  row('Assigned workers', p => fmt(p.workers), ps => fmt(sum(ps, p => p.workers)));
  row('Free workers',
    p => fmt(p.population - p.workers),
    ps => fmt(sum(ps, p => p.population - p.workers)));
  const energyCell = net => {
    const el = document.createElement('span');
    el.textContent = (net >= 0 ? '+' : '') + fmt(net);
    el.style.color = net >= 0 ? '#56d364' : '#ff7b72';
    return el;
  };
  row('Energy (net)',
    p => { const c = energyCell(p.energyProduced - p.energyConsumed);
      c.title = `${fmt(p.energyProduced)} produced · ${fmt(p.energyConsumed)} consumed`; return c; },
    ps => energyCell(sum(ps, p => p.energyProduced - p.energyConsumed)));

  // ── Available (stored) resources. Skip resources nobody holds. ──
  section('Available resources');
  for (const r of RESOURCES) {
    if (!planets.some(p => !p.error && p.stored(r.k) > 0)) continue;
    const label = document.createElement('span');
    label.style.cssText = 'display:inline-flex; align-items:center; gap:7px;';
    label.innerHTML = `<img src="${IMG}/${r.icon}" width="16" height="16" style="width:16px;height:16px;" alt="">` +
      `<span>${r.label.replace(/ (Mine|Processor|Foundry)$/, '')}</span>`;
    row(label,
      p => {
        const cur = p.stored(r.k), cap = p.storageCap(r.k);
        const s = document.createElement('span');
        s.textContent = `${fmt(cur)} / ${fmt(cap)}`;
        if (cap > 0 && cur / cap >= 0.9) s.style.color = '#ff7b72';   // near-full warning
        return s;
      },
      ps => `${fmt(sum(ps, p => p.stored(r.k)))} / ${fmt(sum(ps, p => p.storageCap(r.k)))}`);
  }

  // ── Resource buildings (level · production/h). Skip resources nobody makes. ──
  section('Resource buildings — level · /h');
  for (const r of RESOURCES) {
    const anyProd = planets.some(p => !p.error && (p.prod(r.bd) > 0 || p.level(r.bld) > 0));
    if (!anyProd) continue;
    const label = document.createElement('span');
    label.style.cssText = 'display:inline-flex; align-items:center; gap:7px;';
    label.innerHTML = `<img src="${IMG}/${r.icon}" width="16" height="16" style="width:16px;height:16px;" alt="">` +
      `<span>${r.label}</span>`;
    const tr = document.createElement('tr');
    const ltd = cell('td', null, labelCss); ltd.appendChild(label); tr.appendChild(ltd);
    for (const p of planets) {
      const td = cell('td', null, tdBase);
      if (p.error) { td.textContent = '—'; td.style.color = '#ff7b72'; }
      else {
        const lvl = p.level(r.bld);
        const prod = p.prod(r.bd);
        const top = lvl != null ? `Lv ${lvl}` : '—';
        td.innerHTML = `<div>${top}</div>` +
          `<div style="color:#8b949e; font-size:0.8rem;">${fmt(prod)}/h</div>`;
      }
      tr.appendChild(td);
    }
    const tot = cell('td', null, tdBase + 'color:#f0883e; font-weight:600;');
    tot.innerHTML = `<div>—</div><div style="font-size:0.8rem;">${fmt(sum(planets.filter(p => !p.error), p => p.prod(r.bd)))}/h</div>`;
    tr.appendChild(tot);
    tbody.appendChild(tr);
  }

  // ── Infrastructure: slots, queues, and what's in progress (with live timers). ──
  section('Infrastructure');
  row('Building slots',
    p => `${p.slots.used} / ${p.slots.max}`,
    ps => `${sum(ps, p => p.slots.used)} / ${sum(ps, p => p.slots.max)}`);
  row('Build queue',
    p => `${p.buildQueue.count} / ${p.buildQueue.max}`,
    ps => `${sum(ps, p => p.buildQueue.count)} / ${sum(ps, p => p.buildQueue.max)}`);
  row('Researching',
    p => entriesCell(p.researching, r => entryLine(r.name, r.endsAt)),
    () => '—');
  row('Buildings in construction',
    p => entriesCell(p.construction, c => entryLine(`${c.name} Lv${c.level}→${c.level + 1}`, c.ends)),
    () => '—');
  row('Ships in production',
    p => entriesCell(p.ships, s => entryLine(`${s.yard}: ${s.qty}× ${s.name}${s.repair ? ' (repair)' : ''}`, s.ends)),
    () => '—');

  page.appendChild(table);
}

// The sidebar link (injected by sidebar-inject.js) carries data-nexus-empire.
document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-empire]')) { e.preventDefault(); openEmpire(); }
});
})();
}
