// Injects a per-card ship/cycle picker + "optimal ships to clear" into every
// .field-card on the galaxy page.
//   ships = ceil( remaining / (extraction_capacity * cycles * richness) )
// remaining, richness, fieldType are per-field from the game's own /planets
// fetch (relayed by galaxy-fetch-hook.js, keyed by field id) — the card DOM only
// shows a percent. extraction_capacity comes from the mining ship picked in that
// card's selector (Stats.txt "Mining extraction capacity"). Each field keeps its
// own ship/cycles; a new card inherits the last choice made anywhere.
//
// Wrapped in an IIFE + re-run guard: Firefox can inject a content script twice
// into the same isolated world (extension reload into an open tab), and top-level
// `const`s would then throw "redeclaration of const" and abort the whole script.
if (!window.__nxGalaxyFields) {
window.__nxGalaxyFields = true;
(function () {
const MAX_CYCLES = 10;

// Specialized mining ship per field type + per-cycle extraction of that type
// (Stats.txt "Mining extraction capacity"). The ship is auto-picked from the
// field type; an Excavator in the fleet adds a whole-fleet yield bonus.
const SHIPS = {
  ore:         { ship: 'Mining Vessel', rate: 50 },
  plasma:      { ship: 'Mining Vessel', rate: 25 },
  gas:         { ship: 'Gas Collector', rate: 17 },
  quantum:     { ship: 'Gas Collector', rate: 3 },
  ice:         { ship: 'Ice Drill',     rate: 25 },
  dark_matter: { ship: 'Ice Drill',     rate: 3 },
};
const EXCAVATOR_BONUS = 1.2;   // fleet yield bonus when an Excavator is present

const fieldData = new Map();   // fieldId(string) -> { remaining, richness, type }

// Per-field, independent settings; unset fields use the base default.
function currentCycles(id) {
  const n = parseInt(localStorage.getItem('nx-mining-cycles-' + id), 10);
  return n >= 1 && n <= MAX_CYCLES ? n : MAX_CYCLES;      // clamp 1..MAX_CYCLES
}
function excavatorOn(id) {
  return localStorage.getItem('nx-excavator-' + id) === '1';
}

window.addEventListener('message', e => {
  if (e.origin !== window.location.origin) return;
  const fields = e.data && e.data.__nxFields;
  if (!fields) return;
  for (const f of fields) fieldData.set(String(f.id), f);
  paintAll();
});

// Returns { ships, ship } or { na:true } when no ship mines this field type.
function optimalShips(d, id) {
  const spec = SHIPS[d.type];
  if (!spec) return { na: true };
  if (!d.richness) return null;
  const cap = spec.rate * (excavatorOn(id) ? EXCAVATOR_BONUS : 1);
  return { ships: Math.ceil(d.remaining / (cap * currentCycles(id) * d.richness)), ship: spec.ship };
}

// Build the inline picker (Excavator checkbox + cycle stepper + optimal line)
// once per card. `id` is the field id; changes write that field's key then
// repaint just this card. Fully independent per field.
function buildPicker(card, id) {
  const box = document.createElement('div');
  box.className = 'nx-field-picker';
  box.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:0.68rem;opacity:0.9;';
  box.addEventListener('click', e => e.stopPropagation());   // don't trigger card nav

  const excLabel = document.createElement('label');
  excLabel.style.cssText = 'display:flex;gap:3px;align-items:center;cursor:pointer;';
  const exc = document.createElement('input');
  exc.type = 'checkbox';
  exc.className = 'nx-excavator';
  exc.addEventListener('change', () => {
    localStorage.setItem('nx-excavator-' + id, exc.checked ? '1' : '0');
    paint(card);
  });
  excLabel.append(exc, document.createTextNode('Excavator +20%'));
  box.appendChild(excLabel);

  const cyLabel = document.createElement('span');
  cyLabel.textContent = 'cyc:';
  cyLabel.style.marginLeft = '2px';
  const btnCss = 'background:#1a1f2b;color:#ddd;border:1px solid #3a4256;border-radius:4px;' +
    'width:18px;height:18px;line-height:1;cursor:pointer;font-size:0.85rem;padding:0;';
  const minus = document.createElement('button'); minus.textContent = '−'; minus.style.cssText = btnCss;
  const plus = document.createElement('button'); plus.textContent = '+'; plus.style.cssText = btnCss;
  const val = document.createElement('span');
  val.className = 'nx-cyc-val';
  val.style.cssText = 'min-width:12px;text-align:center;';
  val.textContent = currentCycles(id);   // populate at build so it's never born blank

  const setCycles = n => {
    n = Math.min(MAX_CYCLES, Math.max(1, n));                // guard 1..MAX_CYCLES
    localStorage.setItem('nx-mining-cycles-' + id, n);
    paint(card);
  };
  minus.addEventListener('click', () => setCycles(currentCycles(id) - 1));
  plus.addEventListener('click', () => setCycles(currentCycles(id) + 1));
  box.append(cyLabel, minus, val, plus);

  const optimal = document.createElement('span');
  optimal.className = 'nx-optimal-ships';
  optimal.style.cssText = 'display:block;width:100%;margin-top:2px;';

  const stats = card.querySelector('.field-card-stats') || card;
  stats.append(box, optimal);
  return box;
}

function paint(card) {
  const idBtn = card.querySelector('.field-id-copy');
  const id = idBtn && idBtn.textContent.replace(/\D/g, '');
  const data = id && fieldData.get(id);
  if (!data) return;                                  // no field data yet

  // Rebuild if the box is missing or the game re-rendered .field-card-stats and
  // reconciled away some of the injected children (a partial box would make the
  // reads below throw and leave the cycle number blank).
  let box = card.querySelector('.nx-field-picker');
  if (!box || !box.querySelector('.nx-excavator') || !box.querySelector('.nx-cyc-val')) {
    if (box) box.remove();
    card.querySelectorAll('.nx-optimal-ships').forEach(e => e.remove());   // sibling of box; avoid a dup on rebuild
    box = buildPicker(card, id);
  }

  // Reflect current settings.
  box.querySelector('.nx-excavator').checked = excavatorOn(id);
  box.querySelector('.nx-cyc-val').textContent = currentCycles(id);

  const el = card.querySelector('.nx-optimal-ships');
  const r = optimalShips(data, id);
  if (!r) { el.textContent = ''; return; }
  el.textContent = r.na
    ? `⛏ No mining ship for ${data.type}`
    : `⛏ Optimal: ${r.ships} ${r.ship}${r.ships === 1 ? '' : 's'} to clear (${currentCycles(id)} cyc)`;
}

// User toggle (persisted) to hide/show the injected mining picker + optimal line.
const MINING_VIS_KEY = 'nx-mining-visible';
const miningVisible = () => localStorage.getItem(MINING_VIS_KEY) !== '0';   // default on

function applyMiningVisibility() {
  const show = miningVisible();
  document.querySelectorAll('.nx-field-picker').forEach(el => { el.style.display = show ? 'flex' : 'none'; });
  document.querySelectorAll('.nx-optimal-ships').forEach(el => { el.style.display = show ? 'block' : 'none'; });
  const btn = document.getElementById('nx-mining-toggle');
  if (btn) {
    btn.textContent = show ? '⛏ Mining: on' : '⛏ Mining: off';
    btn.style.opacity = '1';
    if (show) { btn.style.borderColor = '#2ea043'; btn.style.background = '#122117'; btn.style.color = '#56d364'; }
    else { btn.style.borderColor = '#6e3a3a'; btn.style.background = '#2a1a1a'; btn.style.color = '#ff7b72'; }
  }
}

// One toggle button in the galaxy breadcrumb (re-injected if the SPA re-renders).
function injectToggle() {
  if (document.getElementById('nx-mining-toggle')) return;
  const bc = document.querySelector('.galaxy-breadcrumb');
  if (!bc) return;
  const btn = document.createElement('button');
  btn.id = 'nx-mining-toggle';
  btn.type = 'button';
  btn.style.cssText = 'margin-left:10px; padding:3px 10px; border-radius:6px; cursor:pointer;' +
    'font-size:0.72rem; border:1px solid #3a4256; background:#1a1f2b; color:#ddd;';
  btn.addEventListener('click', () => {
    localStorage.setItem(MINING_VIS_KEY, miningVisible() ? '0' : '1');
    applyMiningVisibility();
  });
  bc.appendChild(btn);
  applyMiningVisibility();   // set initial label
}

let queued = false;
function paintAll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (location.pathname !== '/galaxy') return;             // SPA nav: skip off-galaxy
    injectToggle();
    document.querySelectorAll('.field-card').forEach(paint);
    applyMiningVisibility();   // keep newly-painted cards in sync with the toggle
  });
}

new MutationObserver(paintAll).observe(document.documentElement, { childList: true, subtree: true });
// Ask the page-world hook to replay any field data it relayed before this
// listener existed (game fetched the focused system on mount, pre-idle).
window.postMessage({ __nxRequestFields: true }, window.location.origin);
paintAll();
})();
}
