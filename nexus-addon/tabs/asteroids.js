// Asteroids Fields tab: asteroid fields in a chosen region (type, content,
// multiplier, security zone, distance to a chosen planet, miner present).
//
// Enumerates systems through the galaxy sector endpoints rather than the full
// galaxy map:
//   /api/galaxy/arms/{armId}/sectors      → sector ids of an arm
//   /api/galaxy/sectors/{sectorId}/systems → systems (with coords + zone)
//   /api/galaxy/systems/{id}/planets       → that system's asteroidFields
// Per-system scans reuse the finder's shared cache.

import { SCAN_CACHE_MAX, getSystemPlanets } from './finder.js';
import { loadFleetTemplates } from './fleets.js';

const ICON_BASE = 'https://s0.nexuslegacy.space/images/resources/';
// asteroid fieldType → resource icon + label
const FIELD_TYPES = [
  { type: 'ore', res: 'ore', label: 'ore', color: '#f0883e' },
  { type: 'gas', res: 'hydrogen', label: 'gas (hydrogen)', color: '#a371f7' },
  { type: 'ice', res: 'cryo_ice', label: 'ice (cryo-ice)', color: '#a5d6ff' },
  { type: 'plasma', res: 'plasma_core', label: 'plasma (core)', color: '#ff7b72' },
  { type: 'quantum', res: 'quantum_dust', label: 'quantum (dust)', color: '#d2a8ff' },
  { type: 'dark', res: 'dark_matter', label: 'dark (matter)', color: '#6e40c9' },
];
const TYPE_COLOR = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t.color]));
// Security-zone colours: safe → hostile.
const ZONE_COLOR = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#bc8cff', unknown: '#8b949e',
};
const ZONES = ['sentinel', 'open', 'dead', 'rift'];
const afTypeFilter = new Set();    // empty = any; multi-select like the market
const afZoneFilter = new Set();    // empty = any

let afInited = false;
let afArms = [];
let afPlanets = [];                // [{ id, name, systemId, systemName, isHomeworld }]
let afRefMS = null;                // chosen reference planet system coords
let afFields = [];                 // scanned asteroid fields
let afRunning = false;
let afSort = { key: 'distance', dir: 1 };
let afPage = 1;
const AF_PER_PAGE = 25;
const MINING_DURATION = 600;   // seconds; fixed for asteroid mining missions
let afTemplates = [];        // fleet templates, managed in the Fleets tab
const sectorsByArm = {};           // armId → [sector] (cached arm→sectors lookups)

export async function initAsteroidsTab() {
  if (afInited) return;
  afInited = true;
  const status = document.getElementById('af-progress');
  status.textContent = 'Loading…';

  const [arms, planets] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_ARMS' }),
    browser.runtime.sendMessage({ type: 'GET_PLANETS' }),
  ]);
  if (arms.error) { status.textContent = `Error: ${arms.error}`; afInited = false; return; }
  afArms = arms.arms || [];
  afPlanets = (planets.planets || []).filter(p => p.systemId != null);

  const armSel = document.getElementById('af-arm');
  armSel.textContent = '';
  for (const a of afArms) {
    const o = document.createElement('option');
    o.value = a.id; o.textContent = a.name;
    armSel.appendChild(o);
  }

  const pSel = document.getElementById('af-planet');
  pSel.textContent = '';
  for (const p of afPlanets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    if (p.isHomeworld) o.selected = true;
    pSel.appendChild(o);
  }

  drawTypeIcons();
  drawZoneToggles();
  syncArmToPlanet(pSel.value);

  await refreshTemplates();
  // Keep the selector in sync with edits made in the Fleets tab.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fleet_templates) refreshTemplates();
  });

  pSel.addEventListener('change', async () => {
    syncArmToPlanet(pSel.value);
    await resolveRef(pSel.value);
    renderAsteroids();
  });
  document.getElementById('af-scan').addEventListener('click', scan);
  document.getElementById('af-results-head').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    afSort = { key: th.dataset.key, dir: afSort.key === th.dataset.key ? -afSort.dir : -1 };
    afPage = 1;
    renderAsteroids();
  });
  document.getElementById('af-btn-prev').addEventListener('click', () => { afPage--; renderAsteroids(); });
  document.getElementById('af-btn-next').addEventListener('click', () => { afPage++; renderAsteroids(); });
  for (const id of ['af-mult-min', 'af-qty-min']) {
    document.getElementById(id).addEventListener('input', e => {
      if (parseFloat(e.target.value) < 0) e.target.value = '';   // positive only
      afPage = 1;
      renderAsteroids();
    });
  }

  status.textContent = 'Pick a region and Scan.';
}

// Sectors of an arm, cached. Returns [{ id, index, systemCount, visibility }].
async function armSectors(armId) {
  if (sectorsByArm[armId]) return sectorsByArm[armId];
  const res = await browser.runtime.sendMessage({ type: 'GET_ARM_SECTORS', armId });
  if (res.error) throw new Error(res.error);
  sectorsByArm[armId] = res.sectors || [];
  return sectorsByArm[armId];
}

// System name "A12-27" → { armLetter: 'A', sector: 12 }. The arm letter is the
// first letter of the arm's name (Alpha→A, Gamma→G, …).
function parseSystemName(name) {
  const m = /^([A-Z])(\d+)-\d+$/.exec(name || '');
  return m ? { armLetter: m[1], sector: parseInt(m[2], 10) } : null;
}

// Clickable resource-icon type toggles (mirrors the market filter). Empty
// selection means all types; the filter is applied at render time.
function drawTypeIcons() {
  const box = document.getElementById('af-type');
  box.textContent = '';
  for (const t of FIELD_TYPES) {
    const img = document.createElement('img');
    img.className = 'res-icon' + (afTypeFilter.has(t.type) ? ' sel' : '');
    img.src = `${ICON_BASE}${t.res}.webp`;
    img.alt = t.label;
    img.title = t.label;
    img.addEventListener('click', () => {
      if (afTypeFilter.has(t.type)) afTypeFilter.delete(t.type); else afTypeFilter.add(t.type);
      afPage = 1;
      drawTypeIcons();
      renderAsteroids();
    });
    box.appendChild(img);
  }
}

// Clickable zone toggles, coloured per zone. Empty selection means all zones;
// applied at render time.
function drawZoneToggles() {
  const box = document.getElementById('af-zone');
  box.textContent = '';
  for (const z of ZONES) {
    const b = document.createElement('button');
    const on = afZoneFilter.has(z);
    b.type = 'button';
    b.textContent = z;
    b.style.cssText = `padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;
      border:1px solid ${ZONE_COLOR[z]}; text-transform:capitalize;
      color:${on ? '#0d1117' : ZONE_COLOR[z]}; background:${on ? ZONE_COLOR[z] : 'transparent'};`;
    b.addEventListener('click', () => {
      if (on) afZoneFilter.delete(z); else afZoneFilter.add(z);
      afPage = 1;
      drawZoneToggles();
      renderAsteroids();
    });
    box.appendChild(b);
  }
}

// Point the Arm dropdown at the arm of the chosen planet's system.
function syncArmToPlanet(planetId) {
  const p = afPlanets.find(x => x.id === Number(planetId));
  const parsed = p && parseSystemName(p.systemName);
  const arm = parsed && afArms.find(a => a.name[0] === parsed.armLetter);
  if (arm) document.getElementById('af-arm').value = arm.id;
}

// Resolve the reference planet's system coords via its sector (no full map).
async function resolveRef(planetId) {
  afRefMS = null;
  const p = afPlanets.find(x => x.id === Number(planetId));
  if (!p) return;
  const parsed = parseSystemName(p.systemName);
  if (!parsed) return;
  const arm = afArms.find(a => a.name[0] === parsed.armLetter);
  if (!arm) return;
  try {
    const sectors = await armSectors(arm.id);
    const sec = sectors.find(s => s.index + 1 === parsed.sector);
    if (!sec) return;
    const res = await browser.runtime.sendMessage({ type: 'GET_SECTOR_SYSTEMS', sectorId: sec.id });
    const sys = (res.systems || []).find(s => s.id === p.systemId);
    if (sys) afRefMS = { x: sys.x, y: sys.y };
  } catch { /* leave distance blank */ }
}

// Sector range from the input: "27", "25-30", or empty (whole arm).
function sectorRange(arm) {
  const raw = document.getElementById('af-sector').value.trim();
  let from = 1, to = arm.sectorCount;
  const m = raw.match(/^(\d+)\s*[-–—]\s*(\d+)$/) || raw.match(/^(\d+)$/);
  if (m) {
    from = parseInt(m[1], 10);
    to = m[2] !== undefined ? parseInt(m[2], 10) : from;
    if (to < from) [from, to] = [to, from];
  }
  return {
    from: Math.max(1, Math.min(arm.sectorCount, from)),
    to: Math.max(1, Math.min(arm.sectorCount, to)),
  };
}

async function scan() {
  const btn = document.getElementById('af-scan');
  if (afRunning) { afRunning = false; return; }

  const armId = parseInt(document.getElementById('af-arm').value, 10) || 1;
  const arm = afArms.find(a => a.id === armId);
  if (!arm) return;
  const status = document.getElementById('af-progress');

  status.textContent = 'Loading sectors…';
  let sectors;
  try {
    const range = sectorRange(arm);
    sectors = (await armSectors(armId)).filter(s => s.index + 1 >= range.from && s.index + 1 <= range.to);
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    return;
  }

  // Reference coords for distance (resolve once if not done yet).
  if (!afRefMS) await resolveRef(document.getElementById('af-planet').value);

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  afRunning = true;
  btn.textContent = 'Stop';
  afFields = [];
  afPage = 1;
  let scanned = 0, fogged = 0, errors = 0;
  try {
    for (const sec of sectors) {
      if (!afRunning) break;
      let sysRes;
      try {
        sysRes = await browser.runtime.sendMessage({ type: 'GET_SECTOR_SYSTEMS', sectorId: sec.id });
        if (sysRes.error) throw new Error(sysRes.error);
      } catch { errors++; continue; }

      for (const s of (sysRes.systems || [])) {
        if (!afRunning) break;
        if (s.visibility !== 'full' && s.visibility !== 'partial') { fogged++; continue; }
        if (!s.planetCount) { scanned++; continue; }   // no bodies → no fields
        let data;
        try {
          data = await getSystemPlanets(s.id, cache);
        } catch { errors++; scanned++; continue; }
        for (const f of (data.asteroidFields || [])) {
          afFields.push({
            fieldId: f.id,
            name: f.name || `#${f.id}`,
            system: s.name || `#${s.id}`,
            systemId: s.id,
            type: f.fieldType || '—',
            mult: f.richness ?? null,
            remaining: f.remainingResources ?? null,
            total: f.totalResources ?? null,
            zone: s.securityZone || '—',
            sx: s.x, sy: s.y,
            minerPresent: f.controllerName || null,
          });
        }
        scanned++;
        if (scanned % 10 === 0) {
          status.textContent = `Scanning… ${scanned} systems, ${afFields.length} fields.`;
          renderAsteroids();
        }
        await new Promise(r => setTimeout(r, 80)); // be polite to the game API
      }
    }
  } finally {
    afRunning = false;
    btn.textContent = 'Scan';
  }

  // Persist the shared scan cache, oldest entries dropped first.
  const ids = Object.keys(cache);
  if (ids.length > SCAN_CACHE_MAX) {
    ids.sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, ids.length - SCAN_CACHE_MAX)
      .forEach(id => delete cache[id]);
  }
  await browser.storage.local.set({ planet_scan_cache: cache });

  status.textContent = `Done: ${afFields.length} fields in ${scanned} systems` +
    (fogged ? ` · ${fogged} unexplored` : '') +
    (errors ? ` · ${errors} skipped (errors)` : '') + '.';
  renderAsteroids();
}

function distance(f) {
  if (!afRefMS || f.sx == null) return null;
  return Math.round(Math.hypot(f.sx - afRefMS.x, f.sy - afRefMS.y));
}

async function refreshTemplates() {
  afTemplates = await loadFleetTemplates();
  const sel = document.getElementById('af-template-select');
  const cur = sel.value;
  sel.textContent = '';
  if (!afTemplates.length) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = '— none (create one in Fleets) —';
    sel.appendChild(o);
    return;
  }
  for (const t of afTemplates) {
    const o = document.createElement('option');
    o.value = t.id; o.textContent = t.name;
    sel.appendChild(o);
  }
  if (cur && afTemplates.some(t => String(t.id) === cur)) sel.value = cur;
}

// Dispatch the selected template's fleet to a field, after a confirmation.
async function sendMineMission(f) {
  const tpl = afTemplates.find(t => String(t.id) === document.getElementById('af-template-select').value);
  if (!tpl) { alert('No fleet template selected — create one in the Fleets tab.'); return; }
  const wanted = Object.entries(tpl.ships || {})
    .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity }))
    .filter(s => s.quantity > 0);
  if (!wanted.length) { alert(`Template "${tpl.name}" has no ships.`); return; }

  const planetId = Number(document.getElementById('af-planet').value);
  const planet = afPlanets.find(p => p.id === planetId);
  const status = document.getElementById('af-progress');

  // Cap to what the source planet actually has — the mine endpoint errors on
  // ships you don't own (templates can list any shipyard ship).
  status.textContent = 'Checking fleet…';
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (av.error) { status.textContent = `Error: ${av.error}`; return; }
  const ships = wanted
    .map(s => ({ shipDefId: s.shipDefId, quantity: Math.min(s.quantity, av.available[s.shipDefId] || 0) }))
    .filter(s => s.quantity > 0);
  if (!ships.length) {
    status.textContent = `None of template "${tpl.name}"'s ships are available on ${planet ? planet.name : planetId}.`;
    return;
  }
  const short = wanted.some(s => (av.available[s.shipDefId] || 0) < s.quantity);
  const summary = ships.map(s => `${s.quantity}× #${s.shipDefId}`).join(', ');
  if (!confirm(`Send fleet template "${tpl.name}"?\n\nTo: ${f.name} (${f.system})\n` +
    `From: ${planet ? planet.name : planetId}\nShips: ${summary}` +
    (short ? '\n\n⚠ Some template ships are short on this planet; sending what is available.' : ''))) return;

  status.textContent = `Sending to ${f.name}…`;
  const res = await browser.runtime.sendMessage({
    type: 'SEND_MINE',
    sourcePlanetId: planetId,
    targetFieldId: f.fieldId,
    ships,
    miningDuration: MINING_DURATION,
  });
  status.textContent = res.error ? `Send failed: ${res.error}` : `Fleet sent to ${f.name} ✓`;
}

export function renderAsteroids() {
  const tbody = document.getElementById('af-results-tbody');
  tbody.textContent = '';

  document.querySelectorAll('#af-results-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === afSort.key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = afSort.dir === -1 ? '▼' : '▲';
      th.appendChild(arrow);
    }
  });

  let rows = afFields.map(f => ({
    ...f,
    distance: distance(f),
    leftPct: f.total ? Math.round((f.remaining / f.total) * 100) : null,
  }));
  if (afTypeFilter.size) rows = rows.filter(f => afTypeFilter.has(f.type));
  if (afZoneFilter.size) rows = rows.filter(f => afZoneFilter.has(f.zone));

  const num = (id, dflt) => {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? dflt : v;
  };
  const multMin = num('af-mult-min', -Infinity), qtyMin = num('af-qty-min', -Infinity);
  rows = rows.filter(f =>
    (f.mult ?? -Infinity) >= multMin && (f.remaining ?? -Infinity) >= qtyMin);
  const { key, dir } = afSort;
  rows.sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return cmp * dir;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / AF_PER_PAGE));
  afPage = Math.min(Math.max(1, afPage), totalPages);
  document.getElementById('af-page-info').textContent = `Page ${afPage} / ${totalPages}`;
  document.getElementById('af-btn-prev').disabled = afPage <= 1;
  document.getElementById('af-btn-next').disabled = afPage >= totalPages;
  const pageRows = rows.slice((afPage - 1) * AF_PER_PAGE, afPage * AF_PER_PAGE);

  for (const f of pageRows) {
    const tr = document.createElement('tr');

    const sendTd = document.createElement('td');
    const ship = document.createElement('span');
    ship.textContent = '🚀';
    ship.title = 'Send mining fleet here';
    ship.style.cssText = 'cursor:pointer;';
    ship.addEventListener('click', () => sendMineMission(f));
    sendTd.appendChild(ship);
    tr.appendChild(sendTd);

    const content = f.remaining == null ? '—'
      : `${f.remaining.toLocaleString()} / ${(f.total ?? 0).toLocaleString()}`;
    const cells = [
      f.system, String(f.type).replace(/_/g, ' '),
      f.mult == null ? '—' : `×${f.mult}`,
      content,
      f.leftPct == null ? '—' : `${f.leftPct}%`,
      f.zone,
      f.distance == null ? '—' : String(f.distance),
      f.minerPresent || '—',
    ];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 1) td.style.color = TYPE_COLOR[f.type] || '#e6edf3';
      else if (i === 2 && f.mult != null) td.style.color = '#e3b341';
      else if (i === 5) td.style.color = ZONE_COLOR[f.zone] || '#8b949e';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  document.getElementById('af-count').textContent = `${rows.length} fields`;
}
