// In-game addon tabs (POC).
//
// Goal: instead of the addon only living in a separate browser tab
// (dashboard.html opened via target="_blank"), embed the addon's panels *inside*
// the game's own page — the way a native game page (e.g. Buildings) renders in
// the main content area — and trigger game actions through the game's own
// window/session rather than a detached popup.
//
// How it works (reuses existing machinery, no new build system, no rewrite):
//   • sidebar-inject.js already injects a "Addon" section into nav.sidebar-nav.
//     Here we add ONE extra link ("Survey Scanner") to the game's sidebar,
//     styled with the game's own .sidebar-link classes so it looks native.
//   • Clicking it mounts a panel *inside* the game's main content region
//     (.game-content) — an in-page tab, not a new window — whose body is an
//     <iframe src="dashboard.html#scouting">. dashboard.html already deep-links
//     to a tab via location.hash (dashboard.js), so we reuse 100% of the
//     existing Scouting tab rendering with zero duplicated UI code.
//   • The Survey Scan action fired from inside that iframe already routes through
//     the GAME WINDOW: tabs/scouting.js -> SEND_SURVEY -> background.gamePost ->
//     GAME_FETCH message -> sidebar-inject.js does a same-origin fetch with the
//     session cookie. So "launch a Scan for Survey using the game's window" is
//     already satisfied by the existing path; embedding it in-page is the new
//     part.
//
// IIFE + re-run guard: Firefox can inject a content script twice into the same
// isolated world (extension reload into an open tab); top-level consts would then
// throw "redeclaration of const" and abort the script.
if (!window.__nxIngameTabs) {
window.__nxIngameTabs = true;
(function () {
const ext = (typeof browser !== 'undefined' ? browser : chrome);
const DASH_URL = ext.runtime.getURL('dashboard.html');

// lucide-style "radar" icon, matching the game's own sidebar icons.
const SCAN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-radar sidebar-link-icon" aria-hidden="true">
  <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"></path><path d="M4 6h.01"></path>
  <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"></path><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"></path>
  <path d="M12 18h.01"></path><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"></path>
  <circle cx="12" cy="12" r="2"></circle><path d="m13.41 10.59 5.66-5.66"></path></svg>`;

const LINK_ID = 'nexus-ingame-scan-link';
const PANEL_ID = 'nexus-ingame-panel';

// The game's own sidebar nav. Confirmed real selector — sidebar-inject.js mounts
// its "Addon" section here too.
// ponytail: nav.sidebar-nav is the verified live selector (see sidebar-inject.js).
function findNav() { return document.querySelector('nav.sidebar-nav'); }

// The game's main content region, where native pages (Buildings, Research, …)
// render. Mounting our panel here — rather than in <body> as an overlay — is what
// makes this an in-game *tab* instead of a floating window.
// ponytail: '.game-content' is referenced in empire-view.js's header comment as
// the game's content wrapper but is NOT yet confirmed against the live DOM. A
// real version must confirm this selector in-browser (inspect the element that
// holds the Buildings page). Fallbacks below degrade to <main>/<body> so the POC
// still mounts and is visible even if the class differs.
function findContentHost() {
  return document.querySelector('.game-content')
    || document.querySelector('main')
    || document.body;
}

// Add the sidebar link once. Re-run on SPA re-render (the game rebuilds its nav).
function injectLink() {
  if (document.getElementById(LINK_ID)) return;
  const nav = findNav();
  if (!nav) return;
  const a = document.createElement('a');
  a.id = LINK_ID;
  a.className = 'sidebar-link';
  a.href = '#';
  a.setAttribute('data-nexus-ingame-scan', '1');
  a.innerHTML = `${SCAN_ICON}<span class="sidebar-link-label">Survey Scanner</span>`;
  // Append to our existing "Addon" section if sidebar-inject built it, else nav.
  (document.getElementById('nexus-addon-section') || nav).appendChild(a);
}

function closePanel() {
  const p = document.getElementById(PANEL_ID);
  if (p) p.remove();
}

function openPanel() {
  if (document.getElementById(PANEL_ID)) { closePanel(); return; }   // toggle
  const host = findContentHost();

  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  // Fill the content area like a native page. Kept self-contained so a React
  // re-render that swaps the game's own page simply drops our panel (we re-open
  // on the next click) rather than leaving a broken frame.
  panel.style.cssText =
    'position:relative; display:flex; flex-direction:column;' +
    'width:100%; height:100%; min-height:70vh; background:#0d1117;' +
    'border:1px solid #21262d; border-radius:8px; overflow:hidden;';

  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex; align-items:center; gap:10px; padding:8px 12px;' +
    'background:#161b22; border-bottom:1px solid #21262d; color:#e6edf3; font-size:0.9rem;';
  bar.innerHTML = '<span style="color:#f0883e;">📡 Nexus Accounting</span>' +
    '<span style="color:#9aa4b2;">Survey Scanner (in-game)</span>';

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  bar.appendChild(spacer);

  const openTab = document.createElement('a');
  openTab.textContent = 'Open full dashboard ↗';
  openTab.href = DASH_URL;
  openTab.target = '_blank';
  openTab.rel = 'noopener';
  openTab.style.cssText = 'color:#58a6ff; text-decoration:none; font-size:0.82rem;';
  bar.appendChild(openTab);

  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = 'Close';
  close.style.cssText =
    'background:transparent; border:none; color:#8b949e; font-size:1.2rem;' +
    'cursor:pointer; line-height:1; padding:0 4px;';
  close.addEventListener('click', closePanel);
  bar.appendChild(close);

  // The whole addon UI, embedded. Deep-linked to the Scouting tab (which holds
  // Survey Scan) via the hash that dashboard.js already honours. Because
  // dashboard.html is a web_accessible_resource for this origin, the iframe runs
  // as the extension page and can message the background exactly as the
  // standalone tab does — including SEND_SURVEY, which the background routes back
  // through THIS game window's content script for the actual same-origin POST.
  const frame = document.createElement('iframe');
  frame.src = `${DASH_URL}#scouting`;
  frame.style.cssText = 'flex:1; width:100%; border:0; background:#0d1117;';

  panel.append(bar, frame);
  host.appendChild(panel);
  panel.scrollIntoView({ block: 'nearest' });
}

// Delegated click so the link survives SPA re-renders (the node may be recreated).
document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-ingame-scan]')) { e.preventDefault(); openPanel(); }
});

// ── Game-styled fleet picker ────────────────────────────────────────────────
// The embedded Scouting tab (tabs/scouting.js, inside our iframe) can't reach the
// game's CSS, so it asks us — running in the game window — to render the fleet
// picker here using the game's own .spy-modal classes. Mounted in the game DOM,
// it inherits the game stylesheet and looks native. We post the chosen
// [{shipDefId, quantity}] back to the iframe, which does the actual POST through
// the game session. Cancel / close posts back null.
function openFleetModal(msg, source) {
  document.getElementById('nexus-fleet-modal')?.remove();
  const reply = ships =>
    source && source.postMessage({ __nxFleetResult: true, reportId: msg.reportId, ships }, '*');

  const qty = new Map();   // shipDefId → selected qty
  for (const s of (msg.ships || [])) if (s.seed > 0) qty.set(s.shipDefId, s.seed);

  // ponytail: the game normally renders .spy-modal inside its own overlay/portal.
  // We supply our own fixed backdrop and reuse the game's inner classes so the
  // body inherits the game CSS. If a game restyle ties .spy-modal to a specific
  // parent, this wrapper is where to adjust.
  const overlay = document.createElement('div');
  overlay.id = 'nexus-fleet-modal';
  overlay.style.cssText =
    'position:fixed; inset:0; z-index:2147483647; display:flex;' +
    'align-items:center; justify-content:center; background:rgba(0,0,0,0.6);';

  const modal = document.createElement('div');
  modal.className = 'spy-modal';

  const header = document.createElement('div');
  header.className = 'spy-modal-header';
  const h3 = document.createElement('h3');
  h3.textContent = msg.title || 'Investigate Anomaly';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '✕';
  header.append(h3, closeBtn);

  const body = document.createElement('div');
  body.className = 'spy-modal-body';
  if (msg.subtitle) {
    const sect = document.createElement('div');
    sect.className = 'spy-modal-section';
    const info = document.createElement('div');
    info.className = 'spy-target-info';
    const strong = document.createElement('strong');
    strong.textContent = msg.subtitle;
    info.append(strong);
    sect.append(info);
    body.append(sect);
  }

  const section = document.createElement('div');
  section.className = 'spy-modal-section';
  const label = document.createElement('label');
  label.className = 'section-label';
  const list = document.createElement('div');
  list.className = 'ship-select-list';
  list.style.cssText = 'max-height:45vh; overflow-y:auto;';

  const confirmBtn = document.createElement('button');   // referenced by refresh()
  const total = () => [...qty.values()].reduce((a, b) => a + b, 0);
  const refresh = () => {
    const n = total();
    label.textContent = `Select Fleet (${n} selected)`;
    confirmBtn.disabled = n === 0;
    confirmBtn.textContent = `Investigate (${n} ships)`;
  };

  for (const s of (msg.ships || [])) {
    const row = document.createElement('div');
    row.className = 'ship-select-row';
    const name = document.createElement('span');
    name.className = 'ship-select-name';
    if (s.imageUrl) {
      const img = document.createElement('img');
      img.src = s.imageUrl; img.width = 36; img.height = 36; img.alt = s.name;
      name.append(img);
    }
    const nm = document.createElement('span');
    nm.textContent = s.name;
    name.append(nm);

    const controls = document.createElement('div');
    controls.className = 'ship-select-controls';
    const stepper = document.createElement('div');
    stepper.className = 'qty-control ship-quantity-stepper';
    const dec = document.createElement('button');
    dec.type = 'button'; dec.className = 'qty-step-btn'; dec.textContent = '-';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.max = String(s.available); inp.inputMode = 'numeric';
    inp.value = String(qty.get(s.shipDefId) || 0);
    const inc = document.createElement('button');
    inc.type = 'button'; inc.className = 'qty-step-btn'; inc.textContent = '+';
    const maxBtn = document.createElement('button');
    maxBtn.type = 'button'; maxBtn.className = 'qty-max-btn'; maxBtn.textContent = 'Max';
    const setQ = v => {
      v = Math.max(0, Math.min(s.available, v | 0));
      inp.value = String(v);
      if (v > 0) qty.set(s.shipDefId, v); else qty.delete(s.shipDefId);
      refresh();
    };
    dec.addEventListener('click', () => setQ((qty.get(s.shipDefId) || 0) - 1));
    inc.addEventListener('click', () => setQ((qty.get(s.shipDefId) || 0) + 1));
    maxBtn.addEventListener('click', () => setQ(s.available));
    inp.addEventListener('change', () => setQ(parseInt(inp.value, 10) || 0));
    stepper.append(dec, inp, inc, maxBtn);

    const avail = document.createElement('span');
    avail.className = 'ship-select-available';
    avail.textContent = `/${s.available}`;
    controls.append(stepper, avail);

    row.append(name, controls);
    list.append(row);
  }
  if (!(msg.ships || []).length) {
    list.textContent = 'No ships on the source planet.';
  }
  section.append(label, list);
  body.append(section);

  const footer = document.createElement('div');
  footer.className = 'spy-modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-modal-btn';
  cancelBtn.textContent = 'Cancel';
  confirmBtn.className = 'confirm-investigate-btn';
  footer.append(cancelBtn, confirmBtn);

  const finish = ships => { overlay.remove(); reply(ships); };
  closeBtn.addEventListener('click', () => finish(null));
  cancelBtn.addEventListener('click', () => finish(null));
  overlay.addEventListener('click', e => { if (e.target === overlay) finish(null); });
  confirmBtn.addEventListener('click', () => {
    const ships = [...qty.entries()]
      .map(([shipDefId, quantity]) => ({ shipDefId, quantity }))
      .filter(s => s.quantity > 0);
    finish(ships.length ? ships : null);
  });

  modal.append(header, body, footer);
  overlay.append(modal);
  document.body.append(overlay);
  refresh();
}

window.addEventListener('message', e => {
  const d = e.data;
  if (d && d.__nxOpenFleetModal) openFleetModal(d, e.source);
});

injectLink();
// Re-inject the sidebar link when the game re-renders its nav.
new MutationObserver(injectLink)
  .observe(document.documentElement, { childList: true, subtree: true });
})();
}
