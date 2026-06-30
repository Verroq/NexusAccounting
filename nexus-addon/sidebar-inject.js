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

// lucide-style "calculator" icon.
const CALC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="lucide lucide-calculator sidebar-link-icon" aria-hidden="true">
  <rect width="16" height="20" x="4" y="2" rx="2"></rect><line x1="8" x2="16" y1="6" y2="6"></line>
  <line x1="16" x2="16" y1="14" y2="18"></line><path d="M16 10h.01"></path><path d="M12 10h.01"></path>
  <path d="M8 10h.01"></path><path d="M12 14h.01"></path><path d="M8 14h.01"></path>
  <path d="M12 18h.01"></path><path d="M8 18h.01"></path></svg>`;

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
