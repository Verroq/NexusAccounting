// Planet Finder tab: galaxy map, filters, scan loop.

// ── Planet Finder tab ──────────────────────────────────────────────────────

export const SCAN_CACHE_TTL = 24 * 3600 * 1000;   // planets rarely change

export const SCAN_CACHE_MAX = 800;                // systems kept in the cache

export let galaxySystems = null;     // full /api/galaxy/map systems array

export let finderArms = null;

export let finderInited = false;

export let finderRunning = false;

export let finderHits = [];          // matching planets

export let hitSystems = {};          // systemId → {x, y, screenX, screenY, planets: []}

export let mapBounds = null;

export let homeSys = null;           // {x, y} of the home system, for distance

export let myUserId = null;          // player's user id, for "exclude mine"

export let mapView = { scale: 1, ox: 0, oy: 0 };   // pan/zoom transform on the map

export let selectedSystemId = null;  // system focused from a results row

export let myOwnedSystems = new Set();   // system ids where you own a planet

export let myAllianceTag = null;         // your alliance tag (e.g. "SWORD")

export let allianceMemberIds = new Set();// userIds of your alliance members

export let allianceSystems = {};         // systemId → owner name (alliance, found while scanning)

export let galaxyHubs = [];              // market hubs: {name, x, y}

export async function initFinderTab() {
  if (finderInited) return;
  finderInited = true;
  const status = document.getElementById('f-progress');
  status.textContent = 'Loading galaxy map…';
  const [arms, map, home, ally, hubs] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_ARMS' }),
    browser.runtime.sendMessage({ type: 'GET_GALAXY_MAP' }),
    browser.runtime.sendMessage({ type: 'GET_HOME' }),
    browser.runtime.sendMessage({ type: 'GET_ALLIANCE' }),
    browser.runtime.sendMessage({ type: 'GET_HUBS' }),
  ]);
  if (arms.error || map.error) {
    status.textContent = `Error: ${arms.error || map.error}`;
    finderInited = false;
    return;
  }
  finderArms = arms.arms || [];
  galaxySystems = map.systems || [];

  // Home reference for distance + "exclude mine" (best-effort).
  if (home && !home.error) {
    myUserId = home.userId ?? null;
    myOwnedSystems = new Set(home.ownedSystemIds || []);
    const hs = home.systemId != null && galaxySystems.find(s => s.id === home.systemId);
    if (hs) homeSys = { x: hs.x, y: hs.y };
  }
  // Galaxy export/import is owner-only (Verrok).
  if (myUserId === 428) {
    document.getElementById('f-export').style.display = '';
    document.getElementById('f-import').style.display = '';
  }
  if (ally && !ally.error) {
    myAllianceTag = ally.tag || null;
    allianceMemberIds = new Set(ally.memberIds || []);
  }
  if (hubs && !hubs.error) {
    galaxyHubs = (hubs.hubs || [])
      .filter(h => h.systemX != null && h.systemY != null)
      .map(h => ({ name: h.name, x: h.systemX, y: h.systemY }));
  }

  const sel = document.getElementById('f-arm');
  sel.textContent = '';
  for (const a of finderArms) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.name;
    sel.appendChild(o);
  }

  // Zone filter from the distinct security zones present on the map.
  const zsel = document.getElementById('f-zone');
  const zones = [...new Set(galaxySystems.map(s => s.securityZone).filter(Boolean))].sort();
  for (const z of zones) {
    const o = document.createElement('option');
    o.value = z; o.textContent = z;
    zsel.appendChild(o);
  }

  status.textContent = `${galaxySystems.length} systems loaded.`;
  drawGalaxyMap();
}

export function systemDistance(s) {
  if (!homeSys) return null;
  return Math.round(Math.hypot(s.x - homeSys.x, s.y - homeSys.y));
}

// Sector field accepts a single sector ("35") or a range ("33-35").
// Empty means the whole arm.
export function regionSectorIds() {
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

export const MAP_PAD = 14;

// Base projection (data coords → canvas px, before pan/zoom).
export function mapBaseX(canvas, x) {
  return MAP_PAD + (x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX) * (canvas.width - 2 * MAP_PAD);
}
export function mapBaseY(canvas, y) {
  return MAP_PAD + (y - mapBounds.minY) / (mapBounds.maxY - mapBounds.minY) * (canvas.height - 2 * MAP_PAD);
}

export function drawGalaxyMap() {
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
  // base projection + pan/zoom transform
  const sx = x => mapBaseX(canvas, x) * mapView.scale + mapView.ox;
  const sy = y => mapBaseY(canvas, y) * mapView.scale + mapView.oy;

  const region = regionSectorIds();
  const inRegion = s => s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max;

  ctx.textAlign = 'center';
  ctx.font = '10px system-ui, sans-serif';
  for (const s of galaxySystems) {
    const hit = hitSystems[s.id];
    const owned = myOwnedSystems.has(s.id);
    const allyOwner = !owned ? allianceSystems[s.id] : null;
    let color, r;
    if (owned || allyOwner) { color = '#7ee787'; r = 3.5; }   // you / alliance — light green
    else if (hit) { color = '#f0883e'; r = 3.5; }
    else if (inRegion(s)) { color = s.visibility === 'fog' || s.visibility === 'outline' ? '#6e5430' : '#e3b341'; r = 2; }
    else if (s.visibility === 'full' || s.visibility === 'partial') { color = '#2f5a8f'; r = 1.5; }
    else { color = '#21262d'; r = 1; }
    const px = sx(s.x), py = sy(s.y);
    if (owned || allyOwner) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 12);
      grad.addColorStop(0, 'rgba(126,231,135,0.55)');
      grad.addColorStop(1, 'rgba(126,231,135,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    if (allyOwner) {
      ctx.fillStyle = '#7ee787';
      ctx.fillText(allyOwner, px, py - 12);
    }
    if (hit) { hit.screenX = px; hit.screenY = py; }
  }

  // Market hubs — yellow diamonds.
  for (const h of galaxyHubs) {
    const px = sx(h.x), py = sy(h.y), d = 5;
    ctx.fillStyle = '#f5d90a';
    ctx.beginPath();
    ctx.moveTo(px, py - d);
    ctx.lineTo(px + d, py);
    ctx.lineTo(px, py + d);
    ctx.lineTo(px - d, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(h.name, px, py - d - 3);
  }

  // Selection ring for the system focused from a results row.
  if (selectedSystemId != null) {
    const s = galaxySystems.find(x => x.id === selectedSystemId);
    if (s) {
      ctx.strokeStyle = '#58a6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(s.x), sy(s.y), 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// Center the map on a system and select it (called from a results row).
export function focusSystem(systemId) {
  const canvas = document.getElementById('f-map');
  const s = galaxySystems && galaxySystems.find(x => x.id === systemId);
  if (!s) return;
  selectedSystemId = systemId;
  mapView.scale = Math.max(mapView.scale, 4);
  mapView.ox = canvas.width / 2 - mapBaseX(canvas, s.x) * mapView.scale;
  mapView.oy = canvas.height / 2 - mapBaseY(canvas, s.y) * mapView.scale;
  drawGalaxyMap();
  canvas.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function getSystemPlanets(systemId, cache) {
  const entry = cache[systemId];
  if (entry && Date.now() - entry.at < SCAN_CACHE_TTL) return entry.data;
  const data = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_PLANETS', systemId });
  if (data.error) throw new Error(data.error);
  cache[systemId] = { data, at: Date.now() };
  return data;
}

export function moonCount(planet, moons) {
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
  const maxSizeRaw = document.getElementById('f-max-size').value;
  const maxSize = maxSizeRaw === '' ? Infinity : (parseInt(maxSizeRaw, 10) || Infinity);
  const minMoons = parseInt(document.getElementById('f-min-moons').value, 10) || 0;
  const tempMinRaw = document.getElementById('f-temp-min').value;
  const tempMaxRaw = document.getElementById('f-temp-max').value;
  const tempMin = tempMinRaw === '' ? -Infinity : parseInt(tempMinRaw, 10);
  const tempMax = tempMaxRaw === '' ? Infinity : parseInt(tempMaxRaw, 10);
  const wantZone = document.getElementById('f-zone').value;       // '' | zone
  const ownership = document.getElementById('f-ownership').value; // '' | 'unowned' | 'owned'
  const excludeMine = document.getElementById('f-exclude-mine').checked;

  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};
  const cachedIds = new Set(Object.keys(cache).map(Number));

  // Searchable systems: ones you've explored, plus any present in the (possibly
  // imported) scan cache — so shared knowledge covers systems you haven't seen.
  const candidates = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max &&
    (s.visibility === 'full' || s.visibility === 'partial' || cachedIds.has(s.id)) &&
    (!wantZone || s.securityZone === wantZone));
  const fogged = galaxySystems.filter(s =>
    s.armId === region.armId && s.sectorId >= region.min && s.sectorId <= region.max).length - candidates.length;

  const status = document.getElementById('f-progress');
  if (!candidates.length) {
    status.textContent = 'No scanned systems in that region — explore it first or import galaxy data.';
    return;
  }

  finderRunning = true;
  this.textContent = 'Stop';
  finderHits = [];
  hitSystems = {};
  allianceSystems = {};

  let done = 0, errors = 0;
  try {
    for (const s of candidates) {
      if (!finderRunning) break;
      let data;
      try {
        data = await getSystemPlanets(s.id, cache);
      } catch {
        errors++;   // skip the flaky system, keep scanning
        done++;
        continue;
      }
      const moons = data.moons || [];
      const dist = systemDistance(s);
      // Flag alliance presence regardless of the match filters.
      for (const p of (data.planets || [])) {
        if (myUserId != null && p.userId === myUserId) continue;   // mine, already green
        if ((myAllianceTag && p.ownerAllianceTag === myAllianceTag) || allianceMemberIds.has(p.userId)) {
          allianceSystems[s.id] = p.ownerName || 'ally';
        }
      }
      for (const p of (data.planets || [])) {
        if (wantType && p.planetType !== wantType) continue;
        if (p.size < minSize || p.size > maxSize) continue;
        if (p.temperature != null && (p.temperature < tempMin || p.temperature > tempMax)) continue;
        if (ownership === 'unowned' && p.userId != null) continue;
        if (ownership === 'owned' && p.userId == null) continue;
        if (excludeMine && myUserId != null && p.userId === myUserId) continue;
        const nMoons = moonCount(p, moons);
        if (nMoons < minMoons) continue;
        finderHits.push({
          systemId: s.id,
          planet: p.name, system: s.name || `#${s.id}`,
          sector: s.sectorId - (region.armId - 1) * 50,
          type: p.planetType, size: p.size, temp: p.temperature,
          moons: nMoons, zone: s.securityZone || '—', distance: dist,
          owner: p.ownerName || null,
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
    (fogged ? ` · ${fogged} unexplored` : '') +
    (errors ? ` · ${errors} systems skipped (errors)` : '') + '.';
  drawGalaxyMap();
  renderFinderResults();
});

export let finderSort = { key: 'size', dir: -1 };

document.getElementById('f-results-head').addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const key = th.dataset.key;
  finderSort = { key, dir: finderSort.key === key ? -finderSort.dir : -1 };
  renderFinderResults();
});

export function renderFinderResults() {
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
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;          // nulls (e.g. no distance) sort last
    else if (vb == null) cmp = -1;
    else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return cmp * dir || b.size - a.size;
  });
  for (const h of sorted) {
    const tr = document.createElement('tr');
    const cells = [h.planet, h.system, String(h.sector), String(h.type ?? '—').replace(/_/g, ' '),
                   String(h.size), (h.temp == null ? '—' : `${h.temp}°`), String(h.moons),
                   h.zone || '—', (h.distance == null ? '—' : String(h.distance)), h.owner || '—'];
    cells.forEach((v, i) => {
      const td = document.createElement('td');
      td.textContent = v;
      if (i === 4) td.style.color = '#e3b341';
      tr.appendChild(td);
    });
    tr.style.cursor = 'pointer';
    tr.title = 'Show on map';
    tr.addEventListener('click', () => focusSystem(h.systemId));
    tbody.appendChild(tr);
  }
}

// canvas-space cursor coords (account for CSS scaling of the canvas)
export function mapCursor(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
    rect,
  };
}

export let mapPan = null;   // { sx, sy, ox, oy } while dragging

// Hover tooltip over hit systems (suppressed while panning)
document.getElementById('f-map').addEventListener('mousemove', e => {
  const canvas = e.currentTarget;
  if (mapPan) {
    const { x, y } = mapCursor(canvas, e);
    mapView.ox = mapPan.ox + (x - mapPan.sx);
    mapView.oy = mapPan.oy + (y - mapPan.sy);
    drawGalaxyMap();
    return;
  }
  const { x, y, rect } = mapCursor(canvas, e);
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

// Drag to pan
document.getElementById('f-map').addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const canvas = e.currentTarget;
  const { x, y } = mapCursor(canvas, e);
  mapPan = { sx: x, sy: y, ox: mapView.ox, oy: mapView.oy };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => {
  if (!mapPan) return;
  mapPan = null;
  const canvas = document.getElementById('f-map');
  if (canvas) canvas.style.cursor = 'crosshair';
});

// Wheel to zoom toward the cursor
document.getElementById('f-map').addEventListener('wheel', e => {
  if (!galaxySystems) return;
  e.preventDefault();
  const canvas = e.currentTarget;
  const { x, y } = mapCursor(canvas, e);
  const bx = (x - mapView.ox) / mapView.scale;   // base-space point under cursor
  const by = (y - mapView.oy) / mapView.scale;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  mapView.scale = Math.min(12, Math.max(1, mapView.scale * factor));
  mapView.ox = x - bx * mapView.scale;
  mapView.oy = y - by * mapView.scale;
  drawGalaxyMap();
}, { passive: false });

['f-arm', 'f-sector'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (galaxySystems) drawGalaxyMap();
  });
});

// Export the scanned-planet knowledge as a JSON file others can import.
document.getElementById('f-export').addEventListener('click', async () => {
  const status = document.getElementById('f-progress');
  const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
  const cache = planet_scan_cache || {};
  const count = Object.keys(cache).length;
  if (!count) { status.textContent = 'Nothing to export — scan some systems first.'; return; }
  const payload = { type: 'nexus_galaxy_scan', version: 1, exported_at: new Date().toISOString(), scans: cache };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus-galaxy-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  status.textContent = `Exported ${count} systems.`;
});

// Import shared knowledge, merging by freshest scan per system.
document.getElementById('f-import').addEventListener('click', () => {
  document.getElementById('f-import-file').click();
});
document.getElementById('f-import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById('f-progress');
  try {
    const payload = JSON.parse(await file.text());
    const scans = payload.scans || payload;   // tolerate a raw cache object too
    if (!scans || typeof scans !== 'object') throw new Error('not a galaxy export');
    const { planet_scan_cache } = await browser.storage.local.get('planet_scan_cache');
    const cache = planet_scan_cache || {};
    let added = 0, updated = 0;
    for (const [sid, entry] of Object.entries(scans)) {
      if (!entry || !entry.data) continue;
      const cur = cache[sid];
      if (!cur) { cache[sid] = entry; added++; }
      else if ((entry.at || 0) > (cur.at || 0)) { cache[sid] = entry; updated++; }
    }
    const ids = Object.keys(cache);
    if (ids.length > SCAN_CACHE_MAX) {
      ids.sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, ids.length - SCAN_CACHE_MAX)
        .forEach(id => delete cache[id]);
    }
    await browser.storage.local.set({ planet_scan_cache: cache });
    status.textContent = `Imported: ${added} new, ${updated} updated systems. Run a search to use them.`;
  } catch (err) {
    status.textContent = `Import failed: ${err.message}`;
  } finally {
    e.target.value = '';   // allow re-importing the same file
  }
});
