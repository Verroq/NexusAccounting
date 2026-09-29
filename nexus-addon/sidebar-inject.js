// Injects an "Addon → Nexus Tracker" section into the game's sidebar, styled
// with the game's own classes, that opens the addon dashboard. The game is a
// SPA, so re-inject whenever the nav re-renders. dashboard.html is web-
// accessible for this origin, so a plain link to it works.

const ext = (typeof browser !== 'undefined' ? browser : chrome);
const rt = ext.runtime;
const DASH_URL = rt.getURL('dashboard.html');

// lucide-style "line chart" icon, matching the other sidebar icons.
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-line-chart sidebar-link-icon" aria-hidden="true">
  <path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>`;

// lucide-style "globe" icon for the empire-wide view.
const EMPIRE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-globe sidebar-link-icon" aria-hidden="true">
  <circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
  <path d="M2 12h20"></path></svg>`;

// lucide-style "book-open" icon for the user guide.
const GUIDE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-book-open sidebar-link-icon" aria-hidden="true">
  <path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>`;

function buildSection() {
  const section = document.createElement('div');
  section.className = 'sidebar-section';
  section.id = 'nexus-addon-section';
  section.innerHTML = `
    <div class="sidebar-section-label">Addon</div>
    <a class="sidebar-link" href="${DASH_URL}" target="_blank" rel="noopener" data-nexus-addon="1">
      ${ICON}<span class="sidebar-link-label">Nexus Tracker</span>
    </a>
    <a class="sidebar-link" href="#" data-nexus-lsbelts="1">
      ${ICON}<span class="sidebar-link-label">Live Search Belts</span>
    </a>
    <a class="sidebar-link" href="#" data-nexus-empire="1">
      ${EMPIRE_ICON}<span class="sidebar-link-label">Empire View</span>
    </a>
    <a class="sidebar-link" href="#" data-nexus-guide="1">
      ${GUIDE_ICON}<span class="sidebar-link-label">User Guide</span>
    </a>`;
  return section;
}

// Floating, draggable, non-modal panels on the game page.
function makeDraggable(el, handle) {
  handle.addEventListener('mousedown', e => {
    if (e.target.closest('button, input')) return;
    const r = el.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, ox = r.left, oy = r.top;
    el.style.left = `${ox}px`; el.style.top = `${oy}px`; el.style.right = 'auto';
    const onMove = ev => { el.style.left = `${ox + ev.clientX - sx}px`; el.style.top = `${oy + ev.clientY - sy}px`; };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-lsbelts]')) { e.preventDefault(); openFieldsPanel(); }
});

function inject() {
  if (document.getElementById('nexus-addon-section')) return;   // already there
  const nav = document.querySelector('nav.sidebar-nav');
  if (!nav) return;
  nav.appendChild(buildSection());
}

inject();
// Re-inject on SPA navigation / sidebar re-render.
new MutationObserver(() => inject())
  .observe(document.documentElement, { childList: true, subtree: true });

// Run game API writes from the page origin (same-origin + cookies), so they are
// identical to the game's own requests. The background routes the mine call here
// because a Bearer request from the extension is rejected by the server (500).
ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'GAME_FETCH') return;
  fetch(msg.path, {
    method: msg.method || 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(msg.token ? { Authorization: `Bearer ${msg.token}` } : {}),
    },
    body: msg.body != null ? JSON.stringify(msg.body) : undefined,
  }).then(async r => {
    const text = await r.text();
    if (!r.ok) {
      let m = `${r.status}`;
      try { const j = JSON.parse(text); m = j.message || j.error || m; }
      catch { if (text) m = `${r.status}: ${text.slice(0, 200)}`; }
      sendResponse({ error: m, status: r.status, retryAfter: r.headers.get('Retry-After') });
    } else {
      let data = {};
      try { data = JSON.parse(text); } catch { /* empty/non-JSON ok */ }
      sendResponse({ ok: true, data });
    }
  }).catch(e => sendResponse({ error: e.message }));
  return true;   // keep the channel open for the async sendResponse
});

// ── Live-search matches window ──────────────────────────────────────────────
// Opened when the user clicks an asteroid live-search notification. Floating,
// draggable, non-modal.
const TYPE_COLOR = {
  ore: '#f0883e', gas: '#a371f7', ice: '#a5d6ff', plasma: '#ff7b72',
  quantum: '#d2a8ff', dark: '#6e40c9',
};
// Field type → resource icon + label, for the window's type filter (same set
// as the Asteroids tab's FIELD_TYPES).
const FIELD_TYPE_RES = {
  ore: ['ore', 'ore'], gas: ['hydrogen', 'gas (hydrogen)'], ice: ['cryo_ice', 'ice (cryo-ice)'],
  plasma: ['plasma_core', 'plasma (core)'], quantum: ['quantum_dust', 'quantum (dust)'],
  dark: ['dark_matter', 'dark (matter)'],
};
// Ship recommendation per field type: specialized ship + per-cycle extraction
// (Stats.txt). ships = ceil( remaining / (rate * cycles * richness) ); an
// Excavator in the fleet adds a whole-fleet yield bonus.
const REC_SHIP = {
  ore: ['Mining Vessel', 50], plasma: ['Mining Vessel', 25],
  gas: ['Gas Collector', 17], quantum: ['Gas Collector', 3],
  ice: ['Ice Drill', 25], dark: ['Ice Drill', 3],
};
const REC_CYCLES = 10;
const EXCAVATOR_BONUS = 1.2;
// Mining ships the recommendation manages; escort/combat ships in the editor
// are kept when the recommendation swaps in the mining ships.
const MINING_SHIPS = new Set([...Object.values(REC_SHIP).map(s => s[0]), 'Excavator']);
// Returns { count, name } for a match, or null when it can't be computed.
function recommend(m, excavator) {
  const spec = REC_SHIP[m.type];
  if (!spec || !m.remaining || !m.mult) return null;
  const [name, rate] = spec;
  const cap = rate * (excavator ? EXCAVATOR_BONUS : 1);
  return { count: Math.ceil(m.remaining / (cap * REC_CYCLES * m.mult)), name };
}
// The send dialog is the dashboard's own editFleetDialog (common.js), loaded on
// first use so a send from this window works exactly like one from the
// Asteroids Fields tab. common.js is web-accessible for this.
let commonMod = null;
const loadCommon = () => (commonMod ||= import(rt.getURL('common.js')));

let fieldsPanel = null;
async function openFieldsPanel() {
  if (fieldsPanel) { fieldsPanel.remove(); fieldsPanel = null; }
  const { live_search_last_matches, live_search_last_at, live_search } =
    await ext.storage.local.get(['live_search_last_matches', 'live_search_last_at', 'live_search']);
  let matches = live_search_last_matches || [];
  const running = !!(live_search && live_search.enabled);

  const panel = document.createElement('div');
  fieldsPanel = panel;
  panel.style.cssText = 'position:fixed;top:90px;left:90px;z-index:2147483647;width:520px;max-height:62vh;' +
    'display:flex;flex-direction:column;background:#1b2030;color:#e6e8ee;border:1px solid #39405a;' +
    'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.5);font:13px/1.4 system-ui,sans-serif';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
    'padding:10px 14px;border-bottom:1px solid #39405a;cursor:move;user-select:none';
  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.style.fontWeight = '600';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#8b949e;font-size:0.75rem';
  sub.textContent = live_search_last_at ? `as of ${new Date(live_search_last_at).toLocaleTimeString()}` : 'no scan yet';
  titleWrap.append(title, sub);
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:1rem';
  close.onclick = () => { panel.remove(); fieldsPanel = null; };
  header.append(titleWrap, close);

  // Sending context: source planet (from live search) + the fleet template
  // chosen in the picker below. The template seeds the send dialog and, capped
  // to what the planet has, is the fleet the Fuel column estimates for.
  const planetId = live_search && live_search.planetId;
  const { fleet_templates, template_selections } =
    await ext.storage.local.get(['fleet_templates', 'template_selections']);
  const templates = (fleet_templates || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));   // alphabetical picker
  // As in the Asteroids tab: escort-tagged templates are not mining fleets, so
  // the picker leaves them out; they come back as the send dialog's zone
  // escort buttons.
  const miningTemplates = templates.filter(t => !(t.escortZones && t.escortZones.length));
  let avail = {};
  async function refreshAvail() {
    if (!planetId) return;
    const av = await ext.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
    if (av && !av.error) avail = av.available || {};
  }
  await refreshAvail();
  // Source planet name + ship catalog (name → id) for the send dialog.
  const planets = (await ext.runtime.sendMessage({ type: 'GET_PLANETS' })).planets || [];
  const planetName = (planets.find(p => p.id === planetId) || {}).name || planetId;
  const nameToId = {};   // ship name → shipDefId, for the recommendation
  for (const s of ((await ext.runtime.sendMessage({ type: 'GET_SHIP_DEFS' })).ships || [])) {
    if (s.name) nameToId[s.name] = s.shipDefId;
  }
  const miningShipIds = new Set([...MINING_SHIPS].map(n => nameToId[n]).filter(id => id != null));
  let tpl = miningTemplates.find(t => String(t.id) === String((template_selections || {})['af-template-select'])) || miningTemplates[0] || null;
  // Shared with the send dialog's own Excavator checkbox (same key).
  let excavator = localStorage.getItem('nx-af-excavator') === '1';

  // "Already mining" row highlight: fields we already control, or with an
  // active mine mission en route. Mirrors the Asteroids tab's criteria.
  const me = await ext.runtime.sendMessage({ type: 'GET_AUTH_ME' });
  const myUsername = (me && !me.error && me.user) ? me.user.username : null;
  let miningFieldIds = new Set();
  async function refreshMiningFieldIds() {
    const mi = await ext.runtime.sendMessage({ type: 'GET_MISSIONS' });
    miningFieldIds = new Set(
      (mi.missions || []).filter(m => m.missionType === 'mine' && m.targetFieldId != null).map(m => m.targetFieldId));
  }
  await refreshMiningFieldIds();
  const miningRefreshTimer = setInterval(() => {
    if (!panel.isConnected) { clearInterval(miningRefreshTimer); return; }
    refreshMiningFieldIds().then(renderRows);
  }, 10000);

  // Recommended fleet for a match, capped to planet availability: [{shipDefId, quantity}].
  function recShipsFor(m) {
    const r = recommend(m, excavator);
    const id = r && nameToId[r.name];
    if (id == null) return [];
    const q = Math.min(r.count, avail[id] || 0);
    return q > 0 ? [{ shipDefId: id, quantity: q }] : [];
  }
  // The template capped to the planet — what the Fuel column estimates for.
  function templateShips() {
    return Object.entries((tpl && tpl.ships) || {})
      .map(([id, q]) => ({ shipDefId: Number(id), quantity: Math.min(Math.ceil(q), avail[id] || 0) }))
      .filter(s => s.quantity > 0);
  }

  // Same flow as the Asteroids Fields tab: the dialog opens seeded from the
  // template, the fleet is edited there (Optimise Mining Fleet, zone escorts,
  // mine until full, attach leader), and the send goes out from it.
  async function sendMine(m, btn) {
    if (!planetId) { window.alert('Live search has no source planet set.'); return; }
    const { editFleetDialog, attachLeaderStateFor, rememberAttachLeader } = await loadCommon();
    await refreshAvail();   // the window may have been open a while
    const seed = {};
    for (const [id, q] of Object.entries((tpl && tpl.ships) || {})) seed[Number(id)] = q;
    // Excavator bonus left out here: the dialog applies it itself.
    const rec = recommend(m, false);
    const recId = rec && nameToId[rec.name];
    const untilFullState = { untilFull: localStorage.getItem('nx-ls-until-full') === '1' };
    const attachLeaderState = await attachLeaderStateFor(planetId);
    const ships = await editFleetDialog({
      title: `Mine ${m.name}`,
      subtitle: `To: ${m.name} (${m.system})\nFrom: ${planetName}`,
      avail, seed,
      recShips: recId != null ? [{ shipDefId: recId, quantity: rec.count }] : [],
      miningShipIds,
      excavatorShipDefId: nameToId['Excavator'] ?? null,
      excavatorBonus: EXCAVATOR_BONUS,
      escortTemplates: m.zone ? templates.filter(t => (t.escortZones || []).includes(m.zone)) : [],
      untilFullState, attachLeaderState,
    });
    if (!ships || !ships.length) return;   // cancelled or emptied
    localStorage.setItem('nx-ls-until-full', untilFullState.untilFull ? '1' : '0');
    rememberAttachLeader(attachLeaderState);

    btn.disabled = true; btn.textContent = '…';
    const res = await ext.runtime.sendMessage({
      type: 'SEND_MINE', sourcePlanetId: planetId, targetFieldId: m.id, ships, miningDuration: 600,
      mineUntilFull: untilFullState.untilFull, attachLeader: attachLeaderState.attachLeader,
    });
    if (res && res.error) { btn.textContent = '⛏'; btn.disabled = false; window.alert(`Send failed: ${res.error}`); return; }
    miningFieldIds.add(m.id);   // optimistic — GET_MISSIONS can lag right after the send
    renderRows();
    refreshMiningFieldIds().then(renderRows);
  }

  // Template picker (seeds the send dialog) + Excavator toggle for the
  // Recommended column.
  const pickWrap = document.createElement('div');
  pickWrap.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #39405a';
  const pickLbl = document.createElement('span');
  pickLbl.textContent = 'Fleet:'; pickLbl.style.color = '#8b949e';
  const picker = document.createElement('select');
  picker.style.cssText = 'background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:4px 8px;border-radius:6px;font-size:0.85rem';
  if (!miningTemplates.length) {
    const o = document.createElement('option'); o.textContent = '— none (create one in Fleets) —'; picker.appendChild(o); picker.disabled = true;
  } else {
    for (const t of miningTemplates) {
      const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
      if (tpl && String(t.id) === String(tpl.id)) o.selected = true;
      picker.appendChild(o);
    }
  }
  const excLbl = document.createElement('label');
  excLbl.title = 'Include an Excavator: +20% fleet extraction capacity in the recommendation';
  excLbl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;color:#8b949e;font-size:0.85rem;cursor:pointer';
  const excChk = document.createElement('input');
  excChk.type = 'checkbox';
  excChk.checked = excavator;
  excChk.addEventListener('change', () => {
    excavator = excChk.checked;
    localStorage.setItem('nx-af-excavator', excavator ? '1' : '0');
    renderRows();
  });
  excLbl.append(excChk, document.createTextNode('Excavator +20%'));
  pickWrap.append(pickLbl, picker, excLbl);

  // Type filter: which field types the table shows. Display only — the live
  // search itself keeps its own filters. None selected = all types.
  let typeFilter = new Set();
  try { typeFilter = new Set(JSON.parse(localStorage.getItem('nx-ls-type-filter')) || []); } catch { /* none saved */ }
  const typeWrap = document.createElement('div');
  typeWrap.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 14px;border-bottom:1px solid #39405a';
  function drawTypeFilter() {
    typeWrap.textContent = '';
    const lbl = document.createElement('span');
    lbl.textContent = 'Show:'; lbl.style.cssText = 'color:#8b949e;font-size:0.85rem;margin-right:2px';
    typeWrap.append(lbl);
    for (const [type, [res, label]] of Object.entries(FIELD_TYPE_RES)) {
      const on = typeFilter.has(type);
      const img = document.createElement('img');
      img.src = `${location.origin}/images/resources/${res}.webp`;
      img.alt = label;
      img.title = `${label}: ${on ? 'shown (click to remove)' : 'click to show only selected types'}`;
      img.style.cssText = 'width:22px;height:22px;object-fit:contain;cursor:pointer;border-radius:5px;padding:2px;' +
        `border:1px solid ${on ? TYPE_COLOR[type] : 'transparent'};opacity:${!typeFilter.size || on ? 1 : 0.35}`;
      img.onclick = () => {
        if (on) typeFilter.delete(type); else typeFilter.add(type);
        localStorage.setItem('nx-ls-type-filter', JSON.stringify([...typeFilter]));
        drawTypeFilter();
        renderRows();
      };
      typeWrap.append(img);
    }
  }
  drawTypeFilter();

  const body = document.createElement('div');
  body.style.cssText = 'overflow:auto;padding:10px 14px';

  // Fuel estimates by target system + fleet, so re-renders (the 10 s mission
  // refresh, sorting) don't re-POST fuel-estimate for every row. Picking another
  // template changes the key, so it refetches then.
  const fuelCache = new Map();
  const fuelKey = (m, ships) => `${m.systemId}|${ships.map(s => `${s.shipDefId}x${s.quantity}`).join(',')}`;
  let fuelRerender = false;

  // Click a column header to sort; click again to flip. Missing values sink to
  // the bottom either way. First click is ascending for fuel/type, descending
  // for the numbers where bigger is better.
  const SORT_COLS = {
    fuel: { label: 'Fuel (System)', dir: 1 },
    type: { label: 'Type', dir: 1 },
    mult: { label: 'Mult', dir: -1, right: true },
    left: { label: 'Left %', dir: -1, right: true },
    rec:  { label: 'Recommended', dir: -1 },
  };
  let sort = null;
  try { sort = JSON.parse(localStorage.getItem('nx-ls-sort')); } catch { /* no saved sort */ }
  if (!sort || !SORT_COLS[sort.key]) sort = null;

  function renderRows() {
    body.textContent = '';
    const shown = typeFilter.size ? matches.filter(m => typeFilter.has(m.type)) : matches;
    title.textContent = shown.length === matches.length
      ? `Asteroid matches (${matches.length})` : `Asteroid matches (${shown.length} of ${matches.length})`;
    if (!matches.length) { body.textContent = 'No current matches.'; body.style.color = '#8b949e'; return; }
    if (!shown.length) { body.textContent = 'No matches of the selected types.'; body.style.color = '#8b949e'; return; }
    body.style.color = '';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.style.cssText = 'text-align:left;color:#8b949e;font-size:0.8rem';
    hr.innerHTML = '<th style="padding:4px 6px"></th>';
    for (const [key, col] of Object.entries(SORT_COLS)) {
      const th = document.createElement('th');
      th.style.cssText = `padding:4px 6px;cursor:pointer;user-select:none;white-space:nowrap${col.right ? ';text-align:right' : ''}`;
      th.title = 'Sort by this column';
      th.textContent = col.label + (sort && sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
      th.onclick = () => {
        sort = { key, dir: sort && sort.key === key ? -sort.dir : col.dir };
        localStorage.setItem('nx-ls-sort', JSON.stringify(sort));
        renderRows();
      };
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    // Per-row fleet + recommendation, computed once and shared by sort and render.
    // Fuel is estimated for the template, or the recommendation when the
    // template has nothing on this planet.
    const tplShips = templateShips();
    const rows = shown.map(m => {
      const rec = recommend(m, excavator);
      const ships = tplShips.length ? tplShips : recShipsFor(m);
      return { m, rec, ships, fuel: fuelCache.get(fuelKey(m, ships)) };
    });
    if (sort) {
      const val = {
        fuel: r => r.fuel, type: r => r.m.type, mult: r => r.m.mult,
        left: r => r.m.leftPct, rec: r => r.rec && r.rec.count,
      }[sort.key];
      rows.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null || y == null) return (x == null) - (y == null);
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
      });
    }

    const tb = document.createElement('tbody');
    for (const { m, rec, ships } of rows) {
      const tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #2a3147';
      if ((myUsername && m.controllerName === myUsername) || miningFieldIds.has(m.id)) {
        tr.style.background = 'rgba(63,185,80,0.15)';   // already mining / claimed by us
      }

      const mineTd = document.createElement('td');
      mineTd.style.cssText = 'padding:4px 6px';
      const mineBtn = document.createElement('button');
      mineBtn.textContent = '⛏';
      mineBtn.title = planetId ? 'Edit the fleet and send it to mine this field.' : 'Live search has no source planet set.';
      mineBtn.disabled = !planetId;
      mineBtn.style.cssText = planetId
        ? 'background:#238636;border:1px solid #2ea043;color:#fff;border-radius:6px;cursor:pointer;padding:2px 8px;font-size:0.95rem'
        : 'background:#30363d;border:1px solid #30363d;color:#8b949e;border-radius:6px;cursor:not-allowed;padding:2px 8px;font-size:0.95rem';
      mineBtn.onclick = () => sendMine(m, mineBtn);
      mineTd.appendChild(mineBtn);

      const fuelTd = document.createElement('td');
      fuelTd.style.cssText = 'padding:4px 6px';
      const fk = fuelKey(m, ships);
      if (fuelCache.has(fk)) fuelTd.textContent = `${fuelCache.get(fk)} (${m.system})`;
      else {
        fuelTd.textContent = `${ships.length ? '…' : '—'} (${m.system})`;
        if (ships.length && m.systemId != null) {
          ext.runtime.sendMessage({ type: 'GET_FUEL_ESTIMATE', body: { sourcePlanetId: planetId, targetSystemId: m.systemId, ships } })
            .then(est => est && est.fuelCost != null ? est.fuelCost : null, () => null)
            .then(cost => {
              fuelTd.textContent = `${cost ?? '?'} (${m.system})`;
              if (cost == null) return;   // not cached: the next refresh retries it
              fuelCache.set(fk, cost);
              // Sorted by fuel: re-sort once the batch of estimates is in.
              if (sort && sort.key === 'fuel' && !fuelRerender) {
                fuelRerender = true;
                setTimeout(() => { fuelRerender = false; if (panel.isConnected) renderRows(); }, 300);
              }
            });
        }
      }

      const cell = (txt, extra = '') => { const td = document.createElement('td'); td.style.cssText = `padding:4px 6px;${extra}`; td.textContent = txt; return td; };
      tr.append(mineTd, fuelTd,
        cell(m.type, `color:${TYPE_COLOR[m.type] || '#e6e8ee'}`),
        cell(m.mult != null ? `×${m.mult}` : '—', 'text-align:right'),
        cell(m.leftPct != null ? `${m.leftPct}%` : '—', 'text-align:right'),
        cell(rec ? `${rec.count}× ${rec.name}` : '—'));
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    body.appendChild(table);
  }

  picker.addEventListener('change', () => {
    tpl = miningTemplates.find(t => String(t.id) === picker.value) || null;
    ext.storage.local.set({ template_selections: { ...(template_selections || {}), 'af-template-select': picker.value } });
    renderRows();
  });
  renderRows();

  // Live-refresh title/timestamp/rows when a background scan writes new results,
  // so the window doesn't sit on a stale "as of" time. Self-removes once closed.
  function onScan(changes, area) {
    if (area !== 'local' || !('live_search_last_at' in changes || 'live_search_last_matches' in changes)) return;
    if (!panel.isConnected) { ext.storage.onChanged.removeListener(onScan); return; }
    ext.storage.local.get(['live_search_last_matches', 'live_search_last_at']).then(d => {
      matches = d.live_search_last_matches || [];
      sub.textContent = d.live_search_last_at ? `as of ${new Date(d.live_search_last_at).toLocaleTimeString()}` : 'no scan yet';
      renderRows();
    });
  }
  ext.storage.onChanged.addListener(onScan);

  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;' +
    'padding:10px 14px;border-top:1px solid #39405a';
  const note = document.createElement('span');
  note.style.cssText = 'color:#8b949e;font-size:0.75rem';
  // Start/Stop toggle. Starting re-uses the saved config (planet + filters).
  const toggleBtn = document.createElement('button');
  let curRunning = running;
  const paintToggle = () => {
    toggleBtn.textContent = curRunning ? 'Stop Live Search' : 'Start Live Search';
    note.textContent = curRunning ? 'Live search running (every 5 min).' : 'Live search stopped.';
    toggleBtn.style.cssText = curRunning
      ? 'background:#da3633;border:1px solid #f85149;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer'
      : 'background:#238636;border:1px solid #2ea043;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer';
  };
  paintToggle();
  toggleBtn.onclick = async () => {
    if (curRunning) {
      await ext.runtime.sendMessage({ type: 'STOP_LIVE_SEARCH' });
      curRunning = false;
    } else {
      if (!live_search || live_search.planetId == null) {
        window.alert('Configure live search in the Tracker’s Asteroids tab first (planet + filters).');
        return;
      }
      await ext.runtime.sendMessage({ type: 'SET_LIVE_SEARCH', config: { ...live_search, enabled: true } });
      curRunning = true;
    }
    paintToggle();
  };

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:8px;';
  btnGroup.append(toggleBtn);
  footer.append(note, btnGroup);

  panel.append(header, pickWrap, typeWrap, body, footer);
  document.body.append(panel);
  makeDraggable(panel, header);
}

ext.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'SHOW_LS_RESULTS') openFieldsPanel();
});

// Game tab opened from a notification with no tab previously open: show the panel.
ext.storage.local.get('live_search_open_panel').then(({ live_search_open_panel }) => {
  if (live_search_open_panel) { ext.storage.local.set({ live_search_open_panel: false }); openFieldsPanel(); }
});
