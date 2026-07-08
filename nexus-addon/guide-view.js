// User Guide: a body-level overlay (opened from the "User Guide" sidebar link
// added by sidebar-inject.js) documenting the addon's features. Same pattern as
// empire-view.js: reuses the game's dark styling, lives in <body> so React
// re-renders can't wipe it. Content is static; no API calls.
//
// IIFE + re-run guard: Firefox can inject a content script twice into the same
// isolated world (extension reload into an open tab); top-level `const`s would
// then throw "redeclaration of const" and abort the whole script.
if (!window.__nxGuideView) {
window.__nxGuideView = true;
(function () {
const ext = (typeof browser !== 'undefined' ? browser : chrome);
const DASH_URL = ext.runtime.getURL('dashboard.html');

// [section title, [ [lead, text], … ]]. `lead` is bolded; text may be ''.
const SECTIONS = [
  ['Getting started', [
    ['Nexus Tracker', 'The main dashboard: opens in a new tab from the sidebar. Aggregates every report over time into charts, stat cards and sortable tables.'],
    ['In-game tools', 'Empire View, User Guide, Ratio Calculator and Live Search Belts open from the Addon section of the sidebar; the Quartermaster opens from the 📦 button in the top bar. All render as overlays/panels on the game page itself.'],
    ['Data', 'The addon scrapes the game APIs every 15 minutes (and on demand). Everything is stored locally in your browser; nothing is sent anywhere. Auto-backups are written to Downloads before each update.'],
  ]],
  ['Dashboard tabs', [
    ['Global', 'Combined resource totals and a "share by source" breakdown across all activities.'],
    ['Surveys / Pirates / Mining / Expeditions', 'Per-activity totals, net gain (loot − ship-cost losses − fuel), loot-composition doughnut, daily/hourly charts and a sortable report table.'],
    ['Battles', 'Every combat in one place: camp raids, mining/survey ambushes, expedition/wormhole fights and player-vs-player attacks. Click a row to expand the fleets (incl. enemy planetary defenses) and per-ship losses. Export CSV downloads the current view with fleets and per-round detail.'],
    ['Debris', 'Aggregated debris collected over time.'],
    ['Galaxy Scout (Finder)', 'Search explored systems for planets by type, size, temperature, moons, zone and ownership. Moons show type (colour-coded) + building slots.'],
    ['Asteroids', 'Scan the nearest systems for asteroid fields, with a background live-search that notifies you when a new field matches your filter.'],
    ['Fleet Templates', 'Named, planet-agnostic ship lists reused by any task. Mining ships are colour-coded by what they mine (see the legend).'],
    ['Scouting', 'Launch surveys, investigations and debris/salvage collection: see below.'],
    ['Market', 'Your orders, balances and trades, with ratio/left-% filters.'],
    ['Tech Tree', 'Research overview and planning.'],
  ]],
  ['Scouting workflow', [
    ['Survey', 'Sends a probe to the nearest un-surveyed system (respects the zone filter). Scanning fleets show a live progress bar in the "Scanning fleets in transit" panel.'],
    ['Investigate', 'Anomalies awaiting investigation list with a one-click launch. The row keeps a progress bar (En route → Investigating → Returning) and stays until the fleet is home.'],
    ['Debris & Salvage', 'Collect debris fields and post-investigation leftover salvage. Pick cargo ship types once; the addon auto-plans the fewest ships to carry it all and shows fuel, travel time and a progress bar.'],
  ]],
  ['On the galaxy map', [
    ['Mining calculator', 'Each asteroid field card shows the optimal number of mining ships to clear it. A per-card picker sets the mining ship and cycle count (both persist).'],
    ['⛏ Mining toggle', 'The breadcrumb switch hides/shows the injected pickers across all cards at once: green when on, grey-red when off.'],
  ]],
  ['Empire View', [
    ['Per-planet overview', 'A columnar summary of every planet plus a Total column: workforce (population, growth, free/assigned workers, energy), available resources (stored / capacity), resource-building levels + production, and infrastructure with live timers (slots, build queue, research, construction, ship queues).'],
  ]],
  ['Quartermaster (📦 top bar)', [
    ['Overview', 'Total ships stationed across all colonies plus an "In flight" total (ships on active missions), and a card per planet/outpost with its resources and ships.'],
    ['Move by drag & drop', 'Drag a resource or ship from a colony onto another to stage a transfer in the docked builder card at the top: adjust amounts and the transport ships (auto-planned by effective cargo capacity), see fuel + ETA, then Send.'],
    ['What each drop does', 'Planet→planet: deliver resources / transfer (relocate) ships. Planet→outpost: supply resources / deploy ships. Drag an outpost resource onto a planet to collect it (choose source planet + resource types). Nothing sends until you press Send.'],
  ]],
  ['Other sidebar tools', [
    ['Ratio Calculator', 'A floating calculator: enter any two of offer / pay / ratio and it infers the third.'],
    ['Live Search Belts', 'Start/stop the background asteroid live-search and view its latest matches, with per-row fuel and a one-click mine.'],
  ]],
  ['Good to know', [
    ['Stats drift', 'If a "Stats drift detected" banner appears, click Rebuild stats once: it recomputes aggregates from the stored records.'],
    ['Confirmations', 'Every fleet launch asks for confirmation and shows the exact ships being sent.'],
  ]],
];

let overlay = null;
function closeGuide() { if (overlay) { overlay.remove(); overlay = null; } }

function openGuide() {
  if (overlay) { closeGuide(); return; }   // toggle
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; overflow:auto;' +
    'background:#080a10; padding:24px; box-sizing:border-box;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeGuide(); });

  const page = document.createElement('div');
  page.style.cssText = 'max-width:920px; margin:0 auto; color:#c9d1d9; font-size:0.92rem; line-height:1.55;';
  overlay.appendChild(page);
  document.body.appendChild(overlay);

  // Hero banner (game landing art) with the title overlaid.
  const hero = document.createElement('section');
  hero.style.cssText = 'position:relative; overflow:hidden; border-radius:10px; height:150px; margin-bottom:16px;';
  hero.innerHTML =
    '<img src="/images/landing/hero-galaxy.webp" alt="" ' +
      'style="width:100%; height:100%; object-fit:cover; object-position:center 40%; display:block; opacity:0.85;">' +
    '<div style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 24px;' +
      'background:linear-gradient(90deg, rgba(8,10,16,0.85) 0%, rgba(8,10,16,0.35) 60%, rgba(8,10,16,0) 100%);">' +
      '<h1 style="margin:0; font-size:1.9rem; color:#e6edf3;">Nexus Accounting: User Guide</h1>' +
      '<p style="margin:5px 0 0; color:#9aa4b2; font-size:0.9rem;">How the addon works, feature by feature</p>' +
    '</div>';
  page.appendChild(hero);

  for (const [title, items] of SECTIONS) {
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'margin:20px 0 8px; font-size:1.15rem; color:#f0883e;';
    page.appendChild(h);
    const ul = document.createElement('div');
    ul.style.cssText = 'display:flex; flex-direction:column; gap:7px;';
    for (const [lead, text] of items) {
      const row = document.createElement('div');
      row.style.cssText = 'padding-left:14px; border-left:2px solid #21262d;';
      row.innerHTML = `<b style="color:#e6edf3;">${lead}</b>${text ? ': ' + text : ''}`;
      ul.appendChild(row);
    }
    page.appendChild(ul);
  }

  const foot = document.createElement('p');
  foot.style.cssText = 'margin:22px 0 4px; color:#8b949e; font-size:0.85rem;';
  foot.innerHTML = `Open the full dashboard: <a href="${DASH_URL}" target="_blank" rel="noopener" style="color:#58a6ff;">Nexus Tracker</a>.`;
  page.appendChild(foot);

  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = 'Close (Esc)';
  close.style.cssText = 'position:fixed; top:16px; right:20px; z-index:1; background:transparent;' +
    'border:none; color:#8b949e; font-size:1.6rem; cursor:pointer; line-height:1;';
  close.addEventListener('click', closeGuide);
  overlay.appendChild(close);
  const onKey = e => { if (e.key === 'Escape') { closeGuide(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-guide]')) { e.preventDefault(); openGuide(); }
});
})();
}
