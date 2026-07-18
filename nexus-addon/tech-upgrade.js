// Injects an "⬆ upgrade" button onto every technology card (.entity-image holding
// a /api/images/research/…webp image) on the game research page. Clicking opens a
// planner: pick a target level and a destination planet, and it computes the
// total ore/silicates/hydrogen/alloys/rare cost to get there — then hands the
// deficit to the Quartermaster to ship from another planet.
//
// Unlike buildings, research is account-global (a tech's level is the same on
// every planet) — but the cost is *spent on whichever planet launches it*. So
// the planner needs a destination planet (where you'll research) to diff the
// cost against, instead of the building tool's "planet in view".
//
// Cost model (same shape techtree.js uses): each level L costs
//     costOre/…/costAlloys · costFactor^(L-1)   (L 1-indexed), plus rareCosts
// scaled by the same factor. Guarded by test_tech_cost.js.
//
// IIFE + re-run guard: Firefox can inject a content script twice into one
// isolated world; top-level consts would then throw "redeclaration of const".
if (!window.__nxTechUpgrade) {
window.__nxTechUpgrade = true;
(function () {
const IMG = '/images/resources';
// snake cargo key (dispatch + rareCosts keys) → camelCase planet stock field.
const camel = k => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
// The four base cost resources: research-def field · dispatch cargo key.
const BASE_RES = [
  { field: 'costOre',       cargo: 'ore' },
  { field: 'costSilicates', cargo: 'silicates' },
  { field: 'costHydrogen',  cargo: 'hydrogen' },
  { field: 'costAlloys',    cargo: 'alloys' },
];
const fmt = n => Math.round(n || 0).toLocaleString();
const labelOf = cargo => cargo.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Cumulative cost to research from `fromLevel` (exclusive) to `toLevel`
// (inclusive). Returns { cargoKey: amount } in dispatch (snake) keys.
function upgradeCost(t, fromLevel, toLevel) {
  const tot = {};
  for (let L = fromLevel + 1; L <= toLevel; L++) {   // researching level L
    const m = Math.pow(t.costFactor || 1, L - 1);
    for (const r of BASE_RES) {
      const v = Math.round((t[r.field] || 0) * m);
      if (v) tot[r.cargo] = (tot[r.cargo] || 0) + v;
    }
    for (const [k, v] of Object.entries(t.rareCosts || {})) {
      if (v) tot[k] = (tot[k] || 0) + Math.round(v * m);
    }
  }
  return tot;
}

// Tech key from the card image, e.g. /api/images/research/improved_mining.webp
function keyFromCard(card) {
  const img = card.querySelector('img[src*="/research/"]');
  const m = img && img.src.match(/\/research\/([a-z0-9_]+)\.webp/i);
  return m ? m[1] : null;
}

async function fetchJSON(path) {
  const r = await fetch(path, { credentials: 'include' });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// Match a research entry to the card key: exact, else the longest key that's a
// prefix of it.
function findTech(research, techKey) {
  return research.find(x => x.key === techKey)
    || research.filter(x => x.key && techKey.startsWith(x.key + '_'))
               .sort((a, b) => b.key.length - a.key.length)[0];
}

// Resource cost (dispatch cargo keys) to research a tech from→target.
// Exposed for the to-do list (upgrade-queue.js), which sums this across every
// selected item and subtracts planet stock once — not per item, or a shared
// stock pool would get double-counted as covering each item.
window.__nxUpgradeNeed = window.__nxUpgradeNeed || {};
window.__nxUpgradeNeed.tech = async (techKey, planetId, from, target) => {
  const rd = await fetchJSON(`/api/research?planetId=${planetId}`);
  const t = findTech(rd.research || [], techKey);
  if (!t) return {};
  return upgradeCost(t, from, target);
};

// Planet the page happens to be showing (relayed by galaxy-fetch-hook.js) — used
// only as the default destination when it's one of our planets.
let currentPlanetId = null;
window.addEventListener('message', e => {
  if (e.origin !== window.location.origin) return;
  if (e.data && e.data.__nxCurrentPlanet != null) currentPlanetId = e.data.__nxCurrentPlanet;
});
window.postMessage({ __nxRequestCurrentPlanet: true }, window.location.origin);

let panel = null;
function closePanel() { if (panel) { panel.remove(); panel = null; } }

async function openPlanner(techKey) {
  closePanel();
  const overlay = document.createElement('div');
  panel = overlay;
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; background:rgba(0,0,0,.6);' +
    'display:flex; align-items:center; justify-content:center; font:14px/1.5 system-ui,sans-serif;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

  const box = document.createElement('div');
  box.style.cssText = 'background:#12161f; color:#e6edf3; border:1px solid #58a6ff; border-radius:10px;' +
    'width:460px; max-width:92vw; max-height:88vh; overflow:auto; padding:18px 20px;';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  if (window.__nxQueue) window.__nxQueue.mountPanel(overlay);

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0 0 12px; font-size:1.2rem;';
  title.textContent = 'Technology upgrade planner';
  box.appendChild(title);

  const row = (labelText) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex; align-items:center; gap:10px; margin:8px 0;';
    const l = document.createElement('div'); l.style.cssText = 'width:110px; color:#9aa4b2;'; l.textContent = labelText;
    r.appendChild(l);
    box.appendChild(r);
    return r;
  };

  // Destination planet — where the research will run (its stock funds it).
  const pRow = row('Research on');
  const pSel = document.createElement('select');
  pSel.style.cssText = 'flex:1; background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:5px 8px; border-radius:6px;';
  pRow.appendChild(pSel);

  const info = document.createElement('div');
  info.style.cssText = 'color:#8b949e; margin:4px 0 10px; min-height:18px;';
  box.appendChild(info);

  const lvlRow = row('Target level');
  const lvlInp = document.createElement('input');
  lvlInp.type = 'text'; lvlInp.inputMode = 'numeric';   // text = no spinner arrows
  lvlInp.style.cssText = 'width:56px; background:#0d1117; border:1px solid #30363d; color:#e6edf3; padding:5px 8px; border-radius:6px; text-align:right;';
  lvlInp.addEventListener('input', () => { const c = lvlInp.value.replace(/[^\d]/g, ''); if (c !== lvlInp.value) lvlInp.value = c; });
  const stepBtn = txt => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.style.cssText = 'background:#21262d; border:1px solid #30363d; color:#e6edf3; border-radius:6px; padding:5px 9px; cursor:pointer; line-height:1;';
    return b;
  };
  const setLvl = v => { lvlInp.value = String(v); recompute(); };
  const minus = stepBtn('−'); minus.onclick = () => setLvl((parseInt(lvlInp.value, 10) || 0) - 1);
  const plus = stepBtn('+'); plus.onclick = () => setLvl((parseInt(lvlInp.value, 10) || 0) + 1);
  const maxBtn = stepBtn('Max'); maxBtn.onclick = () => setLvl(tech ? tech.maxLevel : lvlInp.value);
  lvlRow.append(minus, lvlInp, plus, maxBtn);
  const lvlHint = document.createElement('span'); lvlHint.style.cssText = 'color:#6e7681;'; lvlRow.appendChild(lvlHint);

  const table = document.createElement('div');
  table.style.cssText = 'margin:12px 0; border-top:1px solid #21262d; padding-top:10px;';
  box.appendChild(table);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex; gap:10px; justify-content:flex-end; margin-top:14px;';
  const sendBtn = document.createElement('button');
  sendBtn.textContent = 'Send deficit via Quartermaster';
  sendBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #1f6feb; background:#1f6feb; color:#fff; cursor:pointer;';
  const addBtn = document.createElement('button');
  addBtn.textContent = '➕ To-do';
  addBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#e6edf3; cursor:pointer; margin-right:auto;';
  addBtn.onclick = () => {
    if (!tech || !window.__nxQueue) return;
    window.__nxQueue.add({ kind: 'tech', key: tech.key, name: tech.name,
      planet: pSel.selectedOptions[0] && pSel.selectedOptions[0].textContent, planetId: destId,
      from: tech.level || 0, target: parseInt(lvlInp.value, 10) || (tech.level || 0) });
  };
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'padding:7px 14px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#e6edf3; cursor:pointer;';
  closeBtn.onclick = closePanel;
  actions.append(addBtn, closeBtn, sendBtn);
  box.appendChild(actions);

  let tech = null;      // the research def (global: level, maxLevel, cost fields)
  let stock = null;     // { camelField: amount } for the selected destination planet
  let destId = null;

  // Load planet list + the (global) research data once.
  info.textContent = 'Loading…';
  let planets;
  try {
    const [pd, rd] = await Promise.all([
      fetchJSON('/api/planets'),
      // Research is account-global; any planetId returns the same defs/levels.
      currentPlanetId != null ? fetchJSON(`/api/research?planetId=${currentPlanetId}`) : null,
    ]);
    planets = (pd.planets || []).map(p => ({ id: p.id, name: p.name || `Planet #${p.id}` }));
    if (!planets.length) { info.textContent = 'No planets found.'; return; }
    // If we couldn't fetch research yet (no planet in view), fetch via planet 1.
    const research = (rd || await fetchJSON(`/api/research?planetId=${planets[0].id}`)).research || [];
    tech = findTech(research, techKey);
    if (!tech) { info.textContent = `“${techKey}” isn't a known technology.`; return; }
  } catch (e) { info.textContent = `Error: ${e.message}`; return; }

  for (const p of planets) {
    const o = document.createElement('option');
    o.value = String(p.id); o.textContent = p.name;
    pSel.appendChild(o);
  }
  destId = planets.some(p => p.id === currentPlanetId) ? currentPlanetId : planets[0].id;
  pSel.value = String(destId);

  info.textContent = `${tech.name} · current level ${tech.level || 0} · max ${tech.maxLevel}`;
  lvlInp.value = String(Math.min(tech.maxLevel, (tech.level || 0) + 1));
  lvlHint.textContent = `(from ${tech.level || 0})`;

  async function loadStock() {
    stock = null; sendBtn.disabled = true; table.textContent = 'Loading planet stock…';
    try {
      const d = await fetchJSON(`/api/planets/${destId}`);
      const pl = d.planet || d;
      stock = pl;
    } catch (e) { table.textContent = `Error: ${e.message}`; return; }
    recompute();
  }

  function recompute() {
    if (!tech || !stock) return;
    table.textContent = '';
    let target = parseInt(lvlInp.value, 10) || 0;
    target = Math.max((tech.level || 0) + 1, Math.min(tech.maxLevel, target));
    lvlInp.value = String(target);
    const need = upgradeCost(tech, tech.level || 0, target);

    const cols = 'display:grid; grid-template-columns:1fr 86px 86px 86px; align-items:center;';
    const numCell = 'text-align:right; padding:5px 10px; border-left:1px solid #21262d;';
    const head = document.createElement('div');
    head.style.cssText = cols + ' color:#8b949e; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; border-bottom:1px solid #30363d;';
    head.innerHTML = '<div style="padding:5px 0;"></div>' +
      `<div style="${numCell}">Need</div>` +
      `<div style="${numCell}">On planet</div>` +
      `<div style="${numCell}">Deficit</div>`;
    table.appendChild(head);

    const deficit = {};
    for (const [cargo, n] of Object.entries(need)) {
      if (!n) continue;
      const have = stock[camel(cargo)] || 0;
      const short = Math.max(0, n - have);
      deficit[cargo] = short;
      const line = document.createElement('div');
      line.style.cssText = cols + ' border-bottom:1px solid #161b22;';
      line.innerHTML =
        `<div style="display:flex; align-items:center; gap:6px; padding:5px 0;"><img src="${IMG}/${cargo}.webp" width="15" height="15" style="width:15px;height:15px;"> ${labelOf(cargo)}</div>` +
        `<div style="${numCell}">${fmt(n)}</div>` +
        `<div style="${numCell} color:#8b949e;">${fmt(have)}</div>` +
        `<div style="${numCell} color:${short > 0 ? '#ff7b72' : '#56d364'};">${short > 0 ? fmt(short) : '—'}</div>`;
      table.appendChild(line);
    }
    const totalShort = Object.values(deficit).reduce((s, v) => s + v, 0);
    sendBtn.disabled = totalShort <= 0;
    sendBtn.title = totalShort <= 0 ? 'Destination planet already has enough' : 'Ship the deficit to the destination planet';
    sendBtn.onclick = () => {
      const nonZero = Object.fromEntries(Object.entries(deficit).filter(([, v]) => v > 0));
      closePanel();
      if (window.__nxDeliverToPlanet) window.__nxDeliverToPlanet(destId, nonZero);
    };
  }

  pSel.addEventListener('change', () => { destId = Number(pSel.value); loadStock(); });
  lvlInp.addEventListener('input', recompute);
  await loadStock();
}

// ── Inject the button onto technology cards ──────────────────────────────────
function injectButtons() {
  document.querySelectorAll('div.entity-image').forEach(card => {
    if (card.querySelector('.nx-tech-btn')) return;
    if (!card.querySelector('img[src*="/research/"]')) return;
    const key = keyFromCard(card);
    if (!key) return;
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'nx-tech-btn';
    btn.type = 'button';
    btn.textContent = '🔬';
    btn.title = 'Plan research resources (addon)';
    btn.style.cssText = 'position:absolute; top:1px; right:1px; z-index:5; width:26px; height:26px; padding:0;' +
      'line-height:24px; font-size:15px; border-radius:6px; border:1px solid #1f6feb; background:#0d1117cc;' +
      'color:#58a6ff; cursor:pointer;';
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openPlanner(key); });
    card.appendChild(btn);
  });
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; injectButtons(); });
}
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
schedule();
})();
}
