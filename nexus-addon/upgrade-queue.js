// Shared upgrade to-do list for the building-, tech-, and ship-upgrade
// planners. Runs in the same isolated world as all three (all content
// scripts of one extension share one `window`), so it just hangs an API off
// `window.__nxQueue`:
//   __nxQueue.add({ kind, key, name, from, target })  — queue an item
//   __nxQueue.mountPanel(overlay)                      — render the list beside a planner
// The queue persists in ext.storage.local and is reorderable by drag & drop.
if (!window.__nxQueue) {
(function () {
const ext = (typeof browser !== 'undefined' ? browser : chrome);
const KEY = 'nx_upgrade_queue';
const ICON = { building: '🏗️', tech: '🔬', ship: '🚀' };

let items = [];
let loaded = false;
let listEl = null;   // the current <div> holding rows, or null when unmounted

async function load() {
  if (loaded) return;
  const got = await ext.storage.local.get(KEY);
  items = (Array.isArray(got[KEY]) ? got[KEY] : []).map(migrate);
  loaded = true;
}
function save() { ext.storage.local.set({ [KEY]: items }); }

// A card stores { kind, key, name, base, steps }: base = the game level it was
// captured at, steps = how many levels it advances. from/target are derived by
// walking the list in order (chain()), so reordering recomputes the labels.
function migrate(it) {
  if (it.steps != null) return it;   // already new-shape
  return { kind: it.kind, key: it.key, name: it.name,
    base: it.from ?? 0, steps: Math.max(1, (it.target ?? 0) - (it.from ?? 0)) };
}

// Resolve each card's displayed from→target from list order: per building/tech,
// start at its base game level and let each successive card continue from the
// previous one's target.
// Chain identity: buildings and ships are per-planet (Silicate Mine — or a
// shipyard build — on planet A is a separate chain from the same one on
// planet B), so include the planet. Research is account-global — one chain
// per tech regardless of destination.
function chainId(it) {
  return it.kind + ':' + it.key + (it.kind === 'building' || it.kind === 'ship' ? ':' + (it.planet || '') : '');
}
function chain() {
  // The starting level of a chain is shared across its cards — take the lowest
  // base seen, so the order in which cards were added (or a card's stale migrated
  // base) can't shift it. Then walk the list in order.
  const baseOf = new Map();
  for (const it of items) {
    const id = chainId(it);
    baseOf.set(id, Math.min(baseOf.has(id) ? baseOf.get(id) : Infinity, it.base));
  }
  const running = new Map();
  return items.map(it => {
    const id = chainId(it);
    const from = running.has(id) ? running.get(id) : baseOf.get(id);
    const target = from + it.steps;
    running.set(id, target);
    return { it, from, target };
  });
}

// Click a card → ask the matching planner for the step's deficit (need − stock
// on the target planet) and stage it in the Quartermaster.
async function deliverStep(it, from, target) {
  const calc = window.__nxUpgradeDeficit && window.__nxUpgradeDeficit[it.kind];
  if (!calc || !window.__nxDeliverToPlanet || it.planetId == null) return;
  let deficit;
  try { deficit = await calc(it.key, it.planetId, from, target); }
  catch (e) { alert(`Could not compute resources: ${e.message}`); return; }
  window.__nxDeliverToPlanet(it.planetId, deficit || {});
}

function render() {
  if (!listEl) return;
  listEl.textContent = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#484f58; padding:10px 2px; font-size:.9rem;';
    empty.textContent = 'Empty — add a building or tech from a planner.';
    listEl.appendChild(empty);
    return;
  }
  chain().forEach(({ it, from, target }, i) => {
    const row = document.createElement('div');
    row.draggable = true;
    row.dataset.i = String(i);
    row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:7px 8px; margin:6px 0;' +
      'background:#0d1117; border:1px solid #21262d; border-radius:7px; cursor:pointer;';
    row.title = 'Ship the resources for this step via Quartermaster';
    row.innerHTML =
      `<span style="opacity:.5; cursor:grab;">⋮⋮</span>` +
      `<span style="font-size:15px;">${ICON[it.kind] || '•'}</span>` +
      `<div style="flex:1; min-width:0;">` +
        `<div style="color:#e6edf3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${it.name || it.key}</div>` +
        `<div style="color:#8b949e; font-size:.8rem;">L${from} → ${target}` +
          (it.planet ? ` · <span style="color:#6e7681;">${it.planet}</span>` : '') + `</div>` +
      `</div>`;
    row.onclick = () => deliverStep(it, from, target);
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '✕';
    del.title = 'Remove';
    del.style.cssText = 'background:none; border:none; color:#6e7681; cursor:pointer; font-size:14px; padding:2px 4px;';
    del.onclick = e => { e.stopPropagation(); items.splice(i, 1); save(); render(); };
    row.appendChild(del);

    row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); row.style.opacity = '.4'; });
    row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    row.addEventListener('dragover', e => { e.preventDefault(); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = Number(row.dataset.i);
      if (Number.isNaN(from) || from === to) return;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      save(); render();
    });
    listEl.appendChild(row);
  });
}

window.__nxQueue = {
  async add(item) {
    await load();
    // item.from = live game level, item.target = level picked in the planner.
    // Continue from the highest level already queued for this building/tech so a
    // second add is a new step: game 20, queue 21, then 22 → "20→21" and "21→22".
    const id = chainId(item);
    const top = chain().filter(r => chainId(r.it) === id)
      .reduce((m, r) => Math.max(m, r.target), item.from);
    const steps = item.target - top;
    if (steps > 0) items.push({ kind: item.kind, key: item.key, name: item.name,
      planet: item.planet, planetId: item.planetId, base: item.from, steps });
    save();
    render();
  },

  // Render the to-do list as a sibling panel to the right of a planner's overlay.
  async mountPanel(overlay) {
    await load();
    const panel = document.createElement('div');
    panel.style.cssText = 'background:#12161f; color:#e6edf3; border:1px solid #30363d; border-radius:10px;' +
      'width:260px; max-width:92vw; max-height:88vh; overflow:auto; padding:16px 16px; margin-left:14px;';
    panel.innerHTML = '<h2 style="margin:0 0 10px; font-size:1.05rem;">To-do</h2>';
    listEl = document.createElement('div');
    listEl.style.cssText = 'max-height:336px; overflow-y:auto;';   // ~6 rows, then scroll
    panel.appendChild(listEl);
    overlay.appendChild(panel);
    render();
  },
};
})();
}
