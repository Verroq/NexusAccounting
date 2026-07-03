// Injects "optimal ships to clear" into every .field-card on the galaxy page.
//   ships = ceil( remaining / (extraction_capacity * MAX_CYCLES * richness) )
// remaining, richness, fieldType are per-field from the game's own /planets
// fetch (relayed by galaxy-fetch-hook.js, keyed by field id) — the card DOM only
// shows a percent. extraction_capacity comes from the mining ship the user picks
// in the injected selector (Stats.txt "Mining extraction capacity").
const MAX_CYCLES = 10;

// ship -> per-cycle extraction per field type. _mult = whole-fleet yield bonus,
// _key = image key. ponytail: race hardcoded terran (this account); derive from
// token if other races need their own ship art.
const SHIP_RACE = 'terran';
const SHIPS = {
  'Mining Vessel': { _key: 'miner',         ore: 50, plasma: 25 },
  'Gas Collector': { _key: 'gas_collector', gas: 17, quantum: 3 },
  'Ice Drill':     { _key: 'ice_drill',     ice: 25, dark_matter: 3 },
  'Excavator':     { _key: 'excavator',     ore: 50, ice: 10, gas: 15, plasma: 30, dark_matter: 3, quantum: 3, _mult: 1.2 },
};

const fieldData = new Map();   // fieldId(string) -> { remaining, richness, type }

function currentShip() {
  const s = localStorage.getItem('nx-mining-ship');
  return SHIPS[s] ? s : 'Mining Vessel';
}

function currentCycles() {
  const n = parseInt(localStorage.getItem('nx-mining-cycles'), 10);
  return n >= 1 && n <= MAX_CYCLES ? n : MAX_CYCLES;      // clamp 1..MAX_CYCLES
}

window.addEventListener('message', e => {
  if (e.origin !== window.location.origin) return;
  const fields = e.data && e.data.__nxFields;
  if (!fields) return;
  for (const f of fields) fieldData.set(String(f.id), f);
  paintAll();
});

// Returns { ships } or { na:true } when the selected ship can't mine this type.
function optimalShips(d) {
  const ship = SHIPS[currentShip()];
  const base = ship[d.type];
  if (base == null) return { na: true };
  if (!d.richness) return null;
  const cap = base * (ship._mult || 1);
  return { ships: Math.ceil(d.remaining / (cap * currentCycles() * d.richness)) };
}

function paint(card) {
  const idBtn = card.querySelector('.field-id-copy');
  const id = idBtn && idBtn.textContent.replace(/\D/g, '');
  const data = id && fieldData.get(id);
  if (!data) return;                                  // no field data yet
  const r = optimalShips(data);
  if (!r) return;

  let el = card.querySelector('.nx-optimal-ships');
  if (!el) {
    el = document.createElement('span');
    el.className = 'nx-optimal-ships';
    el.style.cssText = 'display:block;margin-top:4px;font-size:0.7rem;opacity:0.85;';
    card.querySelector('.field-card-stats').appendChild(el);
  }
  el.textContent = r.na
    ? `⛏ ${currentShip()} can't mine ${data.type}`
    : `⛏ Optimal: ${r.ships} ${currentShip()}${r.ships === 1 ? '' : 's'} to clear (${currentCycles()} cyc)`;
}

// Floating ship picker (clickable images), injected once when field cards exist.
function ensureSelector() {
  if (document.getElementById('nx-ship-picker')) return;
  const box = document.createElement('div');
  box.id = 'nx-ship-picker';
  box.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;background:rgba(20,24,34,0.95);' +
    'color:#ddd;padding:6px 8px;border:1px solid #3a4256;border-radius:6px;font-size:0.72rem;' +
    'display:flex;gap:6px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
  const label = document.createElement('span');
  label.textContent = '⛏ Mining ship:';
  box.appendChild(label);

  function refresh() {
    box.querySelectorAll('.nx-ship-tile').forEach(t => {
      t.style.borderColor = t.dataset.ship === currentShip() ? '#ffb84d' : 'transparent';
      t.style.opacity = t.dataset.ship === currentShip() ? '1' : '0.5';
    });
  }

  for (const [name, def] of Object.entries(SHIPS)) {
    const tile = document.createElement('img');
    tile.className = 'nx-ship-tile';
    tile.dataset.ship = name;
    tile.src = `https://s0.nexuslegacy.space/api/images/ships/${SHIP_RACE}/${def._key}.webp`;
    tile.title = name;
    tile.style.cssText = 'width:41px;height:41px;object-fit:contain;cursor:pointer;border:2px solid transparent;border-radius:5px;padding:1px;';
    tile.addEventListener('click', () => {
      localStorage.setItem('nx-mining-ship', name);
      document.querySelectorAll('.nx-optimal-ships').forEach(e => e.remove());  // recompute cleanly
      refresh();
      paintAll();
    });
    box.appendChild(tile);
  }

  const cyLabel = document.createElement('span');
  cyLabel.textContent = 'cycles:';
  cyLabel.style.marginLeft = '4px';
  const btnCss = 'background:#1a1f2b;color:#ddd;border:1px solid #3a4256;border-radius:4px;' +
    'width:20px;height:20px;line-height:1;cursor:pointer;font-size:0.9rem;padding:0;';
  const minus = document.createElement('button'); minus.textContent = '−'; minus.style.cssText = btnCss;
  const plus = document.createElement('button'); plus.textContent = '+'; plus.style.cssText = btnCss;
  const val = document.createElement('span');
  val.style.cssText = 'min-width:14px;text-align:center;';
  val.textContent = currentCycles();

  function setCycles(n) {
    n = Math.min(MAX_CYCLES, Math.max(1, n));            // guard 1..MAX_CYCLES
    localStorage.setItem('nx-mining-cycles', n);
    val.textContent = n;
    document.querySelectorAll('.nx-optimal-ships').forEach(e => e.remove());  // recompute cleanly
    paintAll();
  }
  minus.addEventListener('click', () => setCycles(currentCycles() - 1));
  plus.addEventListener('click', () => setCycles(currentCycles() + 1));
  box.append(cyLabel, minus, val, plus);

  document.body.appendChild(box);
  refresh();
}

let queued = false;
function paintAll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (location.pathname !== '/galaxy') {                 // SPA nav: hide off-galaxy
      document.getElementById('nx-ship-picker')?.remove();
      return;
    }
    ensureSelector();
    document.querySelectorAll('.field-card').forEach(paint);
  });
}

new MutationObserver(paintAll).observe(document.documentElement, { childList: true, subtree: true });
paintAll();
