// Planet Finder tab: galaxy map, filters, scan loop.

// ── Planet Finder tab ──────────────────────────────────────────────────────

const SCAN_CACHE_TTL = 24 * 3600 * 1000;   // planets rarely change

const SCAN_CACHE_MAX = 800;                // systems kept in the cache

let galaxySystems = null;     // full /api/galaxy/map systems array

let finderArms = null;

let finderInited = false;

let finderRunning = false;

let finderHits = [];          // matching planets

let hitSystems = {};          // systemId → {x, y, screenX, screenY, planets: []}

let mapBounds = null;

async function initFinderTab() {
  if (finderInited) return;
  finderInited = true;
  const status = document.getElementById('f-progress');
  status.textContent = 'Loading galaxy map…';
  const [arms, map] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_ARMS' }),
    browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' }),
  ]);
  if (arms.error || map.error) {
    status.textContent = `Error: ${arms.error || map.error}`;
    finderInited = false;
    return;
  }
  finderArms = arms.arms || [];
  galaxySystems = map.systems || [];

  const sel = document.getElementById('f-arm');
  sel.textContent = '';
  for (const a of finderArms) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name;
    sel.appendChild(o);
  }
  status.textContent = `${galaxySystems.length} systems loaded.`;
  drawGalaxyMap();
}

// Sector field accepts a single sector ("35") or a range ("33-35").
// Empty means the whole arm.
function regionSectorIds() {
  const armId = parseInt(document.getElementById('f-arm').value, 10) || 1;
  const arm = finderArms.find(a => a.id === armId) || { sectorCount: 50 };
  const raw = document.getElementById('f-sector').value.trim();
  let from = 1, to = arm.sectorCount;
  const m = raw.match(/^(\d+)\s*[-–—]\s*(\d+)$/) || raw.match(/^(\d+)$/);
  if (m) {
    from = parseInt(m[1], 10);
    to = m[2] !== undefined ? parseInt(m[2], 10) : from;
    if (to < from) [from, to] = [to, from];
  }
  from = Math.max(1, Math.min(arm.sectorCount, from));
  to = Math.max(1, Math.min(arm.sectorCount, to));
  const base = (armId - 1) * 50;
  return { armId, from, to, min: base + from, max: base + to };
}

function drawGalaxyMap() {
  const canvas = document.getElementById('f-map');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!galaxySystems) return;

  if (!mapBounds) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of galaxySystems) {
      if (s.x < minX) minX = s.x;
      if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) maxY = s.y;
    }
    mapBounds = { minX, maxX, minY, maxY };
  }
  const pad = 14;
  const sx = x => pad + (x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX) * (canvas.width - 2 * pad);
  const sy = y => pad + (y - mapBounds.minY) / (mapBounds.maxY - mapBounds.minY) * (canvas.height - 2 * pad);

  const region = regionSectorIds();
  const inRegion = s => s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max;

  for (const s of galaxySystems) {
    const hit = hitSystems[s.id];
    let color, r;
    if (hit) { color = '#f0883e'; r = 3.5; }
    else if (inRegion(s)) { color = s.visibility === 'fog' || s.visibility === 'outline' ? '#6e5430' : '#e3b341'; r = 2; }
    else if (s.visibility === 'full' || s.visibility === 'partial') { color = '#2f5a8f'; r = 1.5; }
    else { color = '#21262d'; r = 1; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx(s.x), sy(s.y), r, 0, Math.PI * 2);
    ctx.fill();
    if (hit) { hit.screenX = sx(s.x); hit.screenY = sy(s.y); }
  }
}

async function getSystemPlanets(systemId, cache) {
  const entry = cache[systemId];
  if (entry && Date.now() - entry.at < SCAN_CACHE_TTL) return entry.data;
  const data = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_PLANETS', systemId });
  if (data.error) throw new Error(data.error);
  cache[systemId] = { data, at: Date.now() };
  return data;
}

function moonCount(planet, moons) {
  return (moons || []).filter(m => m.planetId === planet.id || m.parentPlanetId === planet.id).length;
}

document.getElementById('f-search').addEventListener('click', async function () {
  if (finderRunning) {
    finderRunning = false;
    return;
  }
  if (!galaxySystems) return;

  const region = regionSectorIds();
  const wantType = document.getElementById('f-type').value;
  const minSize = parseInt(document.getElementById('f-min-size').value, 10) || 0;
  const minMoons = parseInt(document.getElementById('f-min-moons').value, 10) || 0;
  const ownership = document.getElementById('f-ownership').value; // '' | 'unowned' | 'owned'

  const candidates = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max &&
    (s.visibility === 'full' || s.visibility === 'partial'));
  const fogged = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max).length - candidates.length;

  const status = document.getElementById('f-progress');
  if (!candidates.length) {
    status.textContent = 'No scanned systems in that region — explore it first.';
    return;
  }

  finderRunning = true;
  this.textContent = 'Stop';
  finderHits = [];
  hitSystems = {};

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};

  let done = 0;
  try {
    for (const s of candidates) {
      if (!finderRunning) break;
      let data;
      try {
        data = await getSystemPlanets(s.id, cache);
      } catch (e) {
        status.textContent = `Error on ${s.name || s.id}: ${e.message}`;
        break;
      }
      const moons = data.moons || [];
      for (const p of (data.planets || [])) {
        if (wantType && p.planetType !== wantType) continue;
        if (p.size < minSize) continue;
        if (ownership === 'unowned' && p.userId != null) continue;
        if (ownership === 'owned' && p.userId == null) continue;
        const nMoons = moonCount(p, moons);
        if (nMoons < minMoons) continue;
        finderHits.push({
          planet: p.name, system: s.name || `#${s.id}`,
          sector: s.sectorId - (region.armId - 1) * 50,
          type: p.planetType, size: p.size, temp: p.temperature,
          moons: nMoons, owner: p.ownerName || null,
        });
        if (!hitSystems[s.id]) hitSystems[s.id] = { planets: [] };
        hitSystems[s.id].planets.push(`${p.name} (${p.planetType}, ${p.size}, ${nMoons} moons)`);
      }
      done++;
      if (done % 10 === 0) {
        status.textContent = `Scanning… ${done}/${candidates.length} systems, ${finderHits.length} matches.`;
        drawGalaxyMap();
      }
      await new Promise(r => setTimeout(r, 80)); // be polite to the game API
    }
  } finally {
    finderRunning = false;
    this.textContent = 'Search';
  }

  // Persist the scan cache, oldest entries dropped first.
  const ids = Object.keys(cache);
  if (ids.length > SCAN_CACHE_MAX) {
    ids.sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, ids.length - SCAN_CACHE_MAX)
      .forEach(id => delete cache[id]);
  }
  await browser.storage.local.set({ planet_scan_cache: cache });

  status.textContent = `Done: ${finderHits.length} matches in ${done} scanned systems` +
    (fogged ? ` (${fogged} more systems in the region are unexplored).` : '.');
  drawGalaxyMap();
  renderFinderResults();
});

let finderSort = { key: 'size', dir: -1 };

document.getElementById('f-results-head').addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const key = th.dataset.key;
  finderSort = { key, dir: finderSort.key === key ? -finderSort.dir : -1 };
  renderFinderResults();
});

function renderFinderResults() {
  const tbody = document.getElementById('f-results-tbody');
  tbody.textContent = '';
  document.getElementById('f-match-count').textContent = `${finderHits.length} planets`;

  // Header arrows
  document.querySelectorAll('#f-results-head th.sortable').forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === finderSort.key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = finderSort.dir === -1 ? '▼' : '▲';
      th.appendChild(arrow);
    }
  });

  const { key, dir } = finderSort;
  const sorted = finderHits.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || b.size - a.size;
  });
  for (const h of sorted) {
    const tr = document.createElement('tr');
    const cells = [h.planet, h.system, String(h.sector), String(h.type ?? '—').replace(/_/g, ' '),
                   String(h.size), (h.temp == null ? '—' : `${h.temp}°`), String(h.moons), h.owner || '—'];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 4) td.style.color = '#e3b341';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
}

// Hover tooltip over hit systems
document.getElementById('f-map').addEventListener('mousemove', e => {
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const tip = document.getElementById('f-tooltip');
  for (const hit of Object.values(hitSystems)) {
    if (hit.screenX != null && Math.hypot(hit.screenX - x, hit.screenY - y) < 8) {
      tip.textContent = hit.planets.join(' · ');
      tip.style.display = '';
      tip.style.left = `${e.clientX - rect.left + 14}px`;
      tip.style.top = `${e.clientY - rect.top + 14}px`;
      return;
    }
  }
  tip.style.display = 'none';
});

['f-arm', 'f-sector'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (galaxySystems) drawGalaxyMap();
  });
});
