// Injects an "Addon → Nexus Tracker" section into the game's sidebar, styled
// with the game's own classes, that opens the addon dashboard. The game is a
// SPA, so re-inject whenever the nav re-renders. dashboard.html is web-
// accessible for this origin, so a plain link to it works.

const rt = (typeof browser !== 'undefined' ? browser : chrome).runtime;
const DASH_URL = rt.getURL('dashboard.html');

// lucide-style "line chart" icon, matching the other sidebar icons.
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-line-chart sidebar-link-icon" aria-hidden="true">
  <path d="M3 3v16a2 2 0 0 0 2 2h16"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>`;

function buildSection() {
  const section = document.createElement('div');
  section.className = 'sidebar-section';
  section.id = 'nexus-addon-section';
  section.innerHTML = `
    <div class="sidebar-section-label">Addon</div>
    <a class="sidebar-link" href="${DASH_URL}" target="_blank" rel="noopener" data-nexus-addon="1">
      ${ICON}<span class="sidebar-link-label">Nexus Tracker</span>
    </a>`;
  return section;
}

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
