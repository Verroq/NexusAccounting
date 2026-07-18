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

// lucide-style "calculator" icon.
const CALC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-calculator sidebar-link-icon" aria-hidden="true">
  <rect width="16" height="20" x="4" y="2" rx="2"></rect><line x1="8" x2="16" y1="6" y2="6"></line>
  <line x1="16" x2="16" y1="14" y2="18"></line><path d="M16 10h.01"></path><path d="M12 10h.01"></path>
  <path d="M8 10h.01"></path><path d="M12 14h.01"></path><path d="M8 14h.01"></path>
  <path d="M12 18h.01"></path><path d="M8 18h.01"></path></svg>`;

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
    <a class="sidebar-link" href="#" data-nexus-calc="1">
      ${CALC_ICON}<span class="sidebar-link-label">Ratio Calculator</span>
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

// ── Ratio calculator: floating, draggable, non-modal panel on the game page ──
// ratio = offer / pay. Editing any two of {offer, pay, ratio} infers the third
// (the field edited least recently). Offer/pay are positive integers; ratio float.
let calcPanel = null;
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

function openRatioCalc() {
  if (calcPanel) { calcPanel.remove(); calcPanel = null; return; }   // toggle off

  const panel = document.createElement('div');
  calcPanel = panel;
  panel.style.cssText = 'position:fixed;top:120px;left:120px;z-index:2147483647;width:300px;' +
    'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.5);font:14px/1.5 system-ui,sans-serif';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
    'padding:10px 14px;border-bottom:1px solid #39405a;cursor:move;user-select:none';
  const title = document.createElement('span');
  title.textContent = 'Ratio Calculator'; title.style.fontWeight = '600';
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:1rem';
  close.onclick = () => { panel.remove(); calcPanel = null; };
  header.append(title, close);

  const inputCss = 'width:90px;background:#21262d;border:1px solid #30363d;color:#e6edf3;' +
    'padding:6px 9px;border-radius:6px;font-size:0.9rem;-moz-appearance:textfield';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:14px';
  const row = (labelText, ph) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px';
    const l = document.createElement('label');
    l.textContent = labelText;
    const inp = document.createElement('input');
    inp.placeholder = ph; inp.style.cssText = inputCss;
    r.append(l, inp);
    wrap.append(r);
    return inp;
  };
  const a = row('Offer (receive)', 'amount');
  const b = row('For (pay)', 'amount');
  const r = row('Ratio (received per 1 paid)', 'ratio');
  r.style.cssText += ';color:#e3b341;font-weight:600';
  for (const el of [a, b]) { el.type = 'number'; el.min = '0'; el.step = '1'; el.inputMode = 'numeric'; }
  r.type = 'text'; r.inputMode = 'decimal';   // type=text so a mid-typing "2." isn't discarded

  const intOf = el => { el.value = el.value.replace(/\D/g, ''); const v = parseInt(el.value, 10); return isNaN(v) ? null : v; };
  const floatOf = el => { el.value = el.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); const v = parseFloat(el.value); return isNaN(v) ? null : v; };
  const parse = { a: () => intOf(a), b: () => intOf(b), r: () => floatOf(r) };
  const setF = { a: v => { a.value = Math.round(v); }, b: v => { b.value = Math.round(v); }, r: v => { r.value = +v.toFixed(3); } };

  let recent = ['r', 'b', 'a'];   // most-recent first; tracks user input only
  const infer = edited => {
    parse[edited]();
    recent = [edited, ...recent.filter(x => x !== edited)];
    const va = parse.a(), vb = parse.b(), vr = parse.r();
    const target = recent[2];   // least-recently user-edited field
    let out = null;
    if (target === 'a' && vb != null && vr != null) out = vb * vr;
    else if (target === 'b' && va != null && vr > 0) out = va / vr;
    else if (target === 'r' && va != null && vb > 0) out = va / vb;
    if (out != null && isFinite(out) && out >= 0) setF[target](out);
  };
  a.addEventListener('input', () => infer('a'));
  b.addEventListener('input', () => infer('b'));
  r.addEventListener('input', () => infer('r'));

  panel.append(header, wrap);
  document.body.append(panel);
  makeDraggable(panel, header);
  a.focus();
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-calc]')) { e.preventDefault(); openRatioCalc(); }
  else if (e.target.closest('[data-nexus-lsbelts]')) { e.preventDefault(); openFieldsPanel(); }
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
rt.onMessage.addListener((msg, sender, sendResponse) => {
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
      sendResponse({ error: m });
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
// draggable, non-modal — same style as the ratio calculator.
const TYPE_COLOR = {
  ore: '#f0883e', gas: '#a371f7', ice: '#a5d6ff', plasma: '#ff7b72',
  quantum: '#d2a8ff', dark: '#6e40c9',
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
// Confirmation dialog with the fleet composition — mirrors common.js
// confirmDialog so a send from this window looks like one from the dashboard.
function lsConfirm(message, ships, defs, altLabel) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:420px;padding:20px;font:14px/1.5 system-ui,sans-serif;white-space:pre-line';
    const msg = document.createElement('div');
    // Per line so a ⚠ warning (not enough ships to fill the template) shows red.
    for (const line of String(message).split('\n')) {
      const l = document.createElement('div');
      l.textContent = line;
      if (line.trim().startsWith('⚠')) l.style.color = '#ff7b72';
      msg.appendChild(l);
    }
    box.append(msg);
    if (ships && ships.length) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:12px;white-space:normal';
      for (const s of ships) {
        const def = defs[s.shipDefId] || {};
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
        if (def.imageUrl) {
          const img = document.createElement('img');
          img.src = def.imageUrl;
          img.style.cssText = 'width:24px;height:24px;object-fit:contain';
          chip.append(img);
        }
        chip.append(document.createTextNode(`${s.quantity}× ${def.name || '#' + s.shipDefId}`));
        row.append(chip);
      }
      box.append(row);
    }
    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end;white-space:normal';
    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `padding:7px 16px;border-radius:6px;border:1px solid #39405a;cursor:pointer;${primary ? 'background:#3b82f6;color:#fff;border-color:#3b82f6' : 'background:#2a3146;color:#e6e8ee'}`;
      return b;
    };
    const cancel = mk('Cancel', false), ok = mk('Confirm', true);
    const done = v => { ov.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => done('ok');
    ov.onclick = e => { if (e.target === ov) done(false); };
    btns.append(cancel);
    if (altLabel) {
      const alt = mk(altLabel, false);
      alt.style.background = '#bd561d'; alt.style.borderColor = '#db6d28'; alt.style.color = '#fff';
      alt.onclick = () => done('alt');
      btns.append(alt);
    }
    btns.append(ok);
    box.append(btns);
    ov.append(box);
    document.body.append(ov);
    ok.focus();
  });
}

// Hide number-input spinner arrows inside our panels (injected once).
function ensureNoSpinStyle() {
  if (document.getElementById('nx-nospin-style')) return;
  const st = document.createElement('style');
  st.id = 'nx-nospin-style';
  st.textContent = '.nx-no-spin{-moz-appearance:textfield}.nx-no-spin::-webkit-outer-spin-button,.nx-no-spin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}';
  (document.head || document.documentElement).appendChild(st);
}

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
  title.textContent = `Asteroid matches (${matches.length})`; title.style.fontWeight = '600';
  const sub = document.createElement('div');
  sub.style.cssText = 'color:#8b949e;font-size:0.75rem';
  sub.textContent = live_search_last_at ? `as of ${new Date(live_search_last_at).toLocaleTimeString()}` : 'no scan yet';
  titleWrap.append(title, sub);
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:transparent;border:none;color:#8b949e;cursor:pointer;font-size:1rem';
  close.onclick = () => { panel.remove(); fieldsPanel = null; };
  header.append(titleWrap, close);

  // Sending context: source planet (from live search) + a fleet template chosen
  // in the picker below, capped to what the planet actually has. Availability is
  // fetched once; switching template just re-caps and re-renders.
  const planetId = live_search && live_search.planetId;
  const { fleet_templates, template_selections } =
    await ext.storage.local.get(['fleet_templates', 'template_selections']);
  const templates = (fleet_templates || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));   // alphabetical picker
  let avail = {};
  if (planetId) {
    const av = await ext.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
    if (av && !av.error) avail = av.available || {};
  }
  // Source planet name + ship catalog (names/icons) for the confirmation dialog.
  const planets = (await ext.runtime.sendMessage({ type: 'GET_PLANETS' })).planets || [];
  const planetName = (planets.find(p => p.id === planetId) || {}).name || planetId;
  const shipDefs = {};
  const nameToId = {};   // ship name → shipDefId, for the recommendation
  for (const s of ((await ext.runtime.sendMessage({ type: 'GET_SHIP_DEFS' })).ships || [])) {
    shipDefs[s.shipDefId] = s;
    if (s.name) nameToId[s.name] = s.shipDefId;
  }
  let tpl = templates.find(t => String(t.id) === String((template_selections || {})['af-template-select'])) || templates[0] || null;
  let excavator = localStorage.getItem('nx-ls-excavator') === '1';   // +20% capacity toggle

  // Recommended fleet for a match, capped to planet availability: [{shipDefId, quantity}].
  function recShipsFor(m) {
    const r = recommend(m, excavator);
    const id = r && nameToId[r.name];
    if (id == null) return [];
    const q = Math.min(r.count, avail[id] || 0);
    return q > 0 ? [{ shipDefId: id, quantity: q }] : [];
  }

  // Editor's escort/combat ships (non-mining) merged with the recommended mining
  // ships — keeps escorts, swaps mining ships for the calc. Capped to availability.
  function fleetWithRec(recShips) {
    const out = new Map();
    for (const [id, q] of shipsState) {
      const def = shipDefs[id];
      if (def && MINING_SHIPS.has(def.name)) continue;   // drop miners; rec supplies them
      out.set(id, q);
    }
    for (const s of recShips) out.set(s.shipDefId, s.quantity);
    return [...out.entries()]
      .map(([id, q]) => ({ shipDefId: id, quantity: Math.min(q, avail[id] || 0) }))
      .filter(s => s.quantity > 0);
  }

  // Editable fleet composition: one ship type per line. Seeded from the chosen
  // template (capped to the planet), then the user can tweak quantities.
  const shipsState = new Map();   // shipDefId → wanted qty
  function seedFromTemplate(t) {
    shipsState.clear();
    for (const [id, q] of Object.entries((t && t.ships) || {})) {
      const cap = Math.min(q, avail[Number(id)] || 0);
      if (cap > 0) shipsState.set(Number(id), cap);
    }
  }
  function effectiveShips() {
    return [...shipsState.entries()]
      .map(([id, q]) => ({ shipDefId: id, quantity: Math.min(q, avail[id] || 0) }))
      .filter(s => s.quantity > 0);
  }
  seedFromTemplate(tpl);

  ensureNoSpinStyle();

  // Template picker (seeds the editor below) + collapse toggle for the editor.
  const pickWrap = document.createElement('div');
  pickWrap.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid #39405a';
  // Clickable toggle (caret + label) — clearly affords showing/hiding the editor.
  const toggle = document.createElement('button');
  toggle.title = 'Show/hide fleet editor';
  toggle.style.cssText = 'display:inline-flex;align-items:center;gap:5px;background:#21262d;' +
    'border:1px solid #30363d;border-radius:6px;color:#e6edf3;cursor:pointer;padding:4px 9px;font-size:0.85rem';
  toggle.onmouseenter = () => { toggle.style.background = '#2a3146'; };
  toggle.onmouseleave = () => { toggle.style.background = '#21262d'; };
  const caret = document.createElement('span');
  caret.textContent = '▾'; caret.style.cssText = 'transition:transform .15s;transform:rotate(-90deg)';
  const tLbl = document.createElement('span');
  tLbl.textContent = 'Edit fleet';
  toggle.append(caret, tLbl);
  toggle.onclick = () => {
    const hidden = editorWrap.style.display === 'none';
    editorWrap.style.display = hidden ? 'flex' : 'none';
    caret.style.transform = hidden ? '' : 'rotate(-90deg)';
  };
  const pickLbl = document.createElement('span');
  pickLbl.textContent = 'Fleet:'; pickLbl.style.color = '#8b949e';
  const picker = document.createElement('select');
  picker.style.cssText = 'background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:4px 8px;border-radius:6px;font-size:0.85rem';
  if (!templates.length) {
    const o = document.createElement('option'); o.textContent = '— none (create in Asteroids tab) —'; picker.appendChild(o); picker.disabled = true;
  } else {
    for (const t of templates) {
      const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
      if (tpl && String(t.id) === String(tpl.id)) o.selected = true;
      picker.appendChild(o);
    }
  }
  // Excavator +20% toggle — boosts the recommended-ship calculation.
  const excLbl = document.createElement('label');
  excLbl.title = 'Include an Excavator: +20% fleet extraction capacity in the recommendation';
  excLbl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;color:#8b949e;font-size:0.85rem;cursor:pointer';
  const excChk = document.createElement('input');
  excChk.type = 'checkbox';
  excChk.checked = excavator;
  excChk.addEventListener('change', () => {
    excavator = excChk.checked;
    localStorage.setItem('nx-ls-excavator', excavator ? '1' : '0');
    renderRows();
  });
  excLbl.append(excChk, document.createTextNode('Excavator +20%'));
  pickWrap.append(pickLbl, picker, toggle, excLbl);

  // Per-ship-type editor — one line per ship available on the planet (or in the
  // template). Editing a quantity updates the fleet used for fuel + sending.
  const editorWrap = document.createElement('div');
  editorWrap.style.cssText = 'padding:8px 14px;border-bottom:1px solid #39405a;max-height:150px;overflow:auto;flex-direction:column;gap:6px;display:none';
  function buildEditor() {
    editorWrap.textContent = '';
    const ids = new Set([
      ...Object.keys((tpl && tpl.ships) || {}).map(Number),
      ...Object.keys(avail).map(Number).filter(id => (avail[id] || 0) > 0),
    ]);
    if (!ids.size) { editorWrap.textContent = 'No ships available on the source planet.'; editorWrap.style.color = '#8b949e'; return; }
    editorWrap.style.color = '';
    for (const id of ids) {
      const def = shipDefs[id] || {};
      const max = avail[id] || 0;
      // Fixed grid so the icon / name / input / "/max" columns line up across rows.
      const line = document.createElement('div');
      line.style.cssText = 'display:grid;grid-template-columns:20px 1fr 60px 40px;align-items:center;gap:8px';
      const iconCell = document.createElement('span');
      if (def.imageUrl) {
        const img = document.createElement('img');
        img.src = def.imageUrl; img.style.cssText = 'width:20px;height:20px;object-fit:contain;display:block';
        iconCell.append(img);
      }
      const name = document.createElement('span');
      name.textContent = def.name || `#${id}`; name.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = String(max); inp.value = String(shipsState.get(id) || 0);
      inp.className = 'nx-no-spin';
      inp.style.cssText = 'width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:3px 6px;border-radius:6px;font-size:0.85rem;box-sizing:border-box';
      inp.addEventListener('change', () => {
        let v = parseInt(inp.value, 10); if (isNaN(v) || v < 0) v = 0;
        if (v > max) v = max;
        inp.value = String(v);
        if (v > 0) shipsState.set(id, v); else shipsState.delete(id);
        renderRows();
      });
      const avLbl = document.createElement('span');
      avLbl.textContent = `/ ${max}`; avLbl.style.color = '#8b949e';
      line.append(iconCell, name, inp, avLbl);
      editorWrap.append(line);
    }
  }
  buildEditor();

  const body = document.createElement('div');
  body.style.cssText = 'overflow:auto;padding:10px 14px';

  // Row picked via the radio column, for the "Optimise Mining Fleet" button.
  let selectedMatchId = null;

  function renderRows() {
    body.textContent = '';
    if (!matches.length) { body.textContent = 'No current matches.'; body.style.color = '#8b949e'; return; }

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse';
    table.innerHTML = `<thead><tr style="text-align:left;color:#8b949e;font-size:0.8rem">
      <th style="padding:4px 6px"></th><th style="padding:4px 6px"></th><th style="padding:4px 6px">Fuel (System)</th>
      <th style="padding:4px 6px">Type</th><th style="padding:4px 6px;text-align:right">Mult</th>
      <th style="padding:4px 6px;text-align:right">Left %</th>
      <th style="padding:4px 6px">Recommended</th></tr></thead>`;
    const tb = document.createElement('tbody');
    for (const m of matches) {
      const tr = document.createElement('tr');
      tr.style.borderTop = '1px solid #2a3147';

      const selTd = document.createElement('td');
      selTd.style.cssText = 'padding:4px 6px';
      const selInp = document.createElement('input');
      selInp.type = 'radio'; selInp.name = 'nx-ls-row-select';
      selInp.checked = selectedMatchId === m.id;
      selInp.addEventListener('change', () => { selectedMatchId = m.id; paintOptBtn(); });
      selTd.appendChild(selInp);

      // Fleet for this field: the user's chosen template by default (editable
      // in the shared editor); fall back to the calculated recommendation only
      // when the template has nothing sendable (e.g. none selected).
      const rec = recommend(m, excavator);
      const recShips = recShipsFor(m);
      const tplShips = effectiveShips();
      const ships = tplShips.length ? tplShips : fleetWithRec(recShips);
      const canMine = !!(planetId && ships.length);
      const mineTip = !planetId ? 'Live search has no source planet set.'
        : !ships.length ? 'No recommendation and no ships set in the editor.'
        : 'Send the recommended fleet to mine this field.';

      const mineTd = document.createElement('td');
      mineTd.style.cssText = 'padding:4px 6px';
      const mineBtn = document.createElement('button');
      mineBtn.textContent = '⛏';
      mineBtn.title = mineTip;
      mineBtn.disabled = !canMine;
      mineBtn.style.cssText = canMine
        ? 'background:#238636;border:1px solid #2ea043;color:#fff;border-radius:6px;cursor:pointer;padding:2px 8px;font-size:0.95rem'
        : 'background:#30363d;border:1px solid #30363d;color:#8b949e;border-radius:6px;cursor:not-allowed;padding:2px 8px;font-size:0.95rem';
      mineBtn.onclick = async () => {
        if (!canMine) return;
        const short = ships.some(s => (avail[s.shipDefId] || 0) < s.quantity);
        const r = await lsConfirm(
          `Send fleet?\nTo: ${m.name} (${m.system})\nFrom: ${planetName}` +
          (short ? '\n\n⚠ Some ships are short on this planet; sending what is available.' : ''),
          ships, shipDefs);
        if (!r) return;
        const sendShips = ships;
        // Reflect the sent fleet in the shared editor (escorts kept, miners swapped).
        shipsState.clear();
        for (const s of sendShips) shipsState.set(s.shipDefId, s.quantity);
        buildEditor();
        mineBtn.disabled = true; mineBtn.textContent = '…';
        const res = await ext.runtime.sendMessage({
          type: 'SEND_MINE', sourcePlanetId: planetId, targetFieldId: m.id, ships: sendShips, miningDuration: 600,
        });
        if (res && res.error) { mineBtn.textContent = '⛏'; mineBtn.disabled = false; window.alert(`Send failed: ${res.error}`); }
        else { mineBtn.textContent = '✓'; mineBtn.style.cssText = 'background:#1f6feb;border:1px solid #1f6feb;color:#fff;border-radius:6px;padding:2px 8px;font-size:0.95rem'; }
      };
      mineTd.appendChild(mineBtn);

      const fuelTd = document.createElement('td');
      fuelTd.style.cssText = 'padding:4px 6px';
      fuelTd.textContent = `${ships.length ? '…' : '—'} (${m.system})`;
      if (ships.length && m.systemId != null) {
        ext.runtime.sendMessage({ type: 'GET_FUEL_ESTIMATE', body: { sourcePlanetId: planetId, targetSystemId: m.systemId, ships } })
          .then(est => { fuelTd.textContent = `${est && est.fuelCost != null ? est.fuelCost : '?'} (${m.system})`; })
          .catch(() => { fuelTd.textContent = `? (${m.system})`; });
      }

      const cell = (txt, extra = '') => { const td = document.createElement('td'); td.style.cssText = `padding:4px 6px;${extra}`; td.textContent = txt; return td; };
      tr.append(selTd, mineTd, fuelTd,
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
    tpl = templates.find(t => String(t.id) === picker.value) || null;
    ext.storage.local.set({ template_selections: { ...(template_selections || {}), 'af-template-select': picker.value } });
    seedFromTemplate(tpl);
    buildEditor();
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
      title.textContent = `Asteroid matches (${matches.length})`;
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

  // Sets the editor to the recommended ship count for the row picked via the
  // radio column (escorts kept, miner swapped in — same merge as the pickaxe).
  const optBtn = document.createElement('button');
  optBtn.textContent = 'Optimise Mining Fleet';
  optBtn.title = 'Set the editor to the recommended ship count for the selected row';
  const paintOptBtn = () => {
    const has = selectedMatchId != null;
    optBtn.disabled = !has;
    optBtn.style.cssText = has
      ? 'background:#1f6feb;border:1px solid #1f6feb;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer'
      : 'background:#30363d;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:6px;cursor:not-allowed';
  };
  paintOptBtn();
  optBtn.onclick = () => {
    const m = matches.find(x => x.id === selectedMatchId);
    if (!m) return;
    const recShips = recShipsFor(m).slice();
    if (excavator) {
      const excId = nameToId['Excavator'];
      if (excId != null && (avail[excId] || 0) > 0) recShips.push({ shipDefId: excId, quantity: 1 });
    }
    if (!recShips.length) { window.alert('No mining recommendation for this field.'); return; }
    shipsState.clear();
    for (const s of fleetWithRec(recShips)) shipsState.set(s.shipDefId, s.quantity);
    buildEditor();
    renderRows();
  };

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display:flex;gap:8px;';
  btnGroup.append(optBtn, toggleBtn);
  footer.append(note, btnGroup);

  panel.append(header, pickWrap, editorWrap, body, footer);
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
