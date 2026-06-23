// Simulator: fleet import and intel auto-fill (spy + camp scout reports).

import { shipDefs } from './engine.js';
import { fmt, updateFleetStats } from './simulator.js';   // circular: both are functions, only called from handlers

// ── System coordinates & distance ──────────────────────────────────────────

// Resolve a system name input to {x, y}. Uses cached dataset coords if already
// resolved (from fleet load or intel select), else looks up by name.
async function resolveSystemCoords(inputEl) {
  if (inputEl.dataset.x && inputEl.dataset.y) {
    return { x: parseFloat(inputEl.dataset.x), y: parseFloat(inputEl.dataset.y) };
  }
  const name = inputEl.value.trim();
  if (!name) return null;
  const res = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_COORDS', names: [name] });
  const c = res[name];
  if (c) { inputEl.dataset.x = c.x; inputEl.dataset.y = c.y; }
  return c || null;
}

let _resolvedDistanceAU = 0;

// Galaxy-map coordinates are ~57.4× larger than the fuel-AU unit used in
// ship fuelRate stats. Calibrated: 595.3 coord units → 10.37 fuel-AU
// (50 cruisers + 34 scouts → 5,891 H round trip).
const COORD_TO_FUEL_AU = 1 / 57.4;

// Euclidean coordinate distance between two systems, scaled to fuel-AU.
function coordDistanceAU(a, d) {
  return Math.sqrt((d.x - a.x) ** 2 + (d.y - a.y) ** 2) * COORD_TO_FUEL_AU;
}

async function updateDistanceFromCoords() {
  const atkInput = document.getElementById('atk-system');
  const defInput = document.getElementById('def-system');
  const [a, d] = await Promise.all([resolveSystemCoords(atkInput), resolveSystemCoords(defInput)]);
  const display = document.getElementById('distance-display');
  if (!a || !d) { display.textContent = ''; _resolvedDistanceAU = 0; return; }
  _resolvedDistanceAU = coordDistanceAU(a, d);
  display.textContent = `↔ ${_resolvedDistanceAU.toFixed(2)} AU`;
}

// Clear cached coords when user types manually (so it re-resolves by name).
function coordInputHandler(inputEl) {
  inputEl.addEventListener('input', () => {
    delete inputEl.dataset.x;
    delete inputEl.dataset.y;
    updateDistanceFromCoords();
  });
}

// ── Load my fleet ──────────────────────────────────────────────────────────

async function populatePlanetPicker() {
  const sel = document.getElementById('fleet-planet');
  const res = await browser.runtime.sendMessage({ type: 'GET_PLANETS' });
  if (res.error || !res.planets?.length) return;
  sel.textContent = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All planets';
  sel.appendChild(allOpt);
  for (const p of res.planets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.isHomeworld ? `${p.name} (home)` : p.name;
    if (p.systemName) o.dataset.systemName = p.systemName;
    if (p.systemId != null) o.dataset.systemId = p.systemId;
    if (p.isHomeworld) o.selected = true;
    sel.appendChild(o);
  }
}

document.getElementById('btn-load-fleet').addEventListener('click', async function () {
  this.disabled = true;
  const status = document.getElementById('sim-status');
  try {
    const planetId = document.getElementById('fleet-planet').value;
    const classFilter = document.getElementById('fleet-class').value;
    const res = await browser.runtime.sendMessage({ type: 'GET_FLEET', planetId });
    if (res.error) {
      status.textContent = `Load fleet failed: ${res.error}`;
      return;
    }
    let total = 0;
    document.querySelectorAll('input[data-side="attacker"][data-key]').forEach(input => {
      const key = input.dataset.key;
      if (classFilter && shipDefs[key]?.shipClass !== classFilter) return;
      const qty = res.fleet[key] || 0;
      input.value = qty;
      total += qty;
    });
    const selOpt = document.getElementById('fleet-planet').selectedOptions[0];
    const planetLabel = selOpt?.textContent || '';
    const typeLabel = classFilter
      ? document.getElementById('fleet-class').selectedOptions[0]?.textContent
      : 'all types';
    status.textContent = `Loaded ${total} ships (${typeLabel}) from ${planetLabel}.`;
    if (selOpt?.dataset.systemName) {
      document.getElementById('atk-system').value = selOpt.dataset.systemName;
      updateDistanceFromCoords();
    }
  } finally {
    this.disabled = false;
  }
});

// ── Fill tech levels from stored research ──────────────────────────────────

async function fillTechLevels(side) {
  const status = document.getElementById('sim-status');
  const { research } = await browser.storage.local.get('research');
  if (!research?.length) {
    status.textContent = 'No research data — open the game and click Scrape Now first.';
    return;
  }
  const levels = {};
  for (const t of research) levels[t.key] = t.level || 0;
  let filled = 0;
  document.querySelectorAll(`input[data-tech-side="${side}"]`).forEach(input => {
    const lvl = levels[input.dataset.tech] || 0;
    input.value = lvl;
    if (lvl > 0) filled++;
  });
  updateFleetStats(side);
  status.textContent = `Filled ${filled} research levels into ${side} tech.`;
}

document.getElementById('btn-fill-tech-attacker').addEventListener('click', () => fillTechLevels('attacker'));
document.getElementById('btn-fill-tech-defender').addEventListener('click', () => fillTechLevels('defender'));

// ── Intel reports (spy + camp scout) → defender auto-fill ──────────────────

// Map intel building list → defender defense levels. Substring-matches the
// normalized building key; takes the highest level per type. Unknown buildings
// (e.g. Shield Generator) are ignored.
function classifyDefenses(buildings) {
  const d = { missile_defense: 0, laser_defense: 0, railgun_defense: 0, plasma_defense: 0, ion_defense: 0, ew_system: 0 };
  for (const b of (buildings || [])) {
    const k = (b.key || '').toLowerCase().replace(/[\s-]/g, '_');
    const lvl = b.level || 0;
    if (k.includes('missile')) d.missile_defense = Math.max(d.missile_defense, lvl);
    else if (k.includes('laser')) d.laser_defense = Math.max(d.laser_defense, lvl);
    else if (k.includes('railgun')) d.railgun_defense = Math.max(d.railgun_defense, lvl);
    else if (k.includes('plasma')) d.plasma_defense = Math.max(d.plasma_defense, lvl);
    else if (k.includes('ion')) d.ion_defense = Math.max(d.ion_defense, lvl);
    else if (k.includes('ew') || k.includes('electronic')) d.ew_system = Math.max(d.ew_system, lvl);
  }
  return d;
}

let intelReports = [];

async function loadIntelReports() {
  const { spy_reports, camp_scout_reports } =
    await browser.storage.local.get(['spy_reports', 'camp_scout_reports']);
  intelReports = [];
  for (const r of (camp_scout_reports || [])) {
    if (!r.fleet?.length) continue;
    intelReports.push({
      id: `camp-${r.id}`,
      label: `Camp #${r.camp_id ?? '?'} — ${new Date(r.created_at).toLocaleDateString()}`,
      fleet: r.fleet, buildings: [], resources: null,
    });
  }
  for (const r of (spy_reports || [])) {
    intelReports.push({
      id: `spy-${r.id}`,
      label: `Spy: ${r.target_name}${r.target_user ? ` (${r.target_user})` : ''} — ${new Date(r.created_at).toLocaleDateString()}`,
      fleet: r.fleet || [], buildings: r.buildings || [], resources: r.resources,
      target_system_id:   r.target_system_id   || null,
      target_system_name: r.target_system_name || null,
    });
  }
  const sel = document.getElementById('report-select');
  while (sel.options.length > 1) sel.remove(1);
  for (const r of intelReports) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.label;
    sel.appendChild(o);
  }
}

document.getElementById('report-select').addEventListener('change', async function () {
  const r = intelReports.find(x => x.id === this.value);
  if (!r) return;

  document.querySelectorAll('input[data-side="defender"][data-key]').forEach(input => {
    const item = r.fleet.find(f => f.key === input.dataset.key);
    input.value = item ? item.quantity : 0;
  });

  const defLevels = classifyDefenses(r.buildings);
  document.getElementById('def-missile').value = defLevels.missile_defense;
  document.getElementById('def-laser').value   = defLevels.laser_defense;
  document.getElementById('def-railgun').value = defLevels.railgun_defense;
  document.getElementById('def-plasma').value  = defLevels.plasma_defense;
  document.getElementById('def-ion').value     = defLevels.ion_defense;
  document.getElementById('def-ew').value      = defLevels.ew_system;

  renderTargetIntel(r);
  const total = r.fleet.reduce((s, f) => s + f.quantity, 0);
  const defSummary = Object.entries(defLevels).filter(([,v]) => v > 0).map(([k,v]) => `${k.replace(/_/g,' ')} ${v}`).join(', ') || 'no defenses';
  document.getElementById('sim-status').textContent =
    `Defender filled from report: ${total} ships, ${defSummary}.`;
  if (r.target_system_id) {
    const coords = await browser.runtime.sendMessage({ type: 'GET_SYSTEM_COORDS', ids: [r.target_system_id] });
    const c = coords[r.target_system_id];
    const defInput = document.getElementById('def-system');
    defInput.value = c?.name || r.target_system_name || '';
    if (c) { defInput.dataset.x = c.x; defInput.dataset.y = c.y; }
    else { delete defInput.dataset.x; delete defInput.dataset.y; }
    updateDistanceFromCoords();
  }
});

const LOOT_FACTOR = 0.5; // assumed share of resources lootable in a raid

function renderTargetIntel(r) {
  const panel = document.getElementById('target-intel');
  panel.textContent = '';
  if (!r.resources || !Object.keys(r.resources).length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';

  const note = text => {
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    div.textContent = text;
    return div;
  };

  let numericTotal = 0;
  let qualitative = false;
  const parts = [];
  for (const [k, v] of Object.entries(r.resources)) {
    if (typeof v === 'number') {
      numericTotal += v;
      if (v) parts.push(`${k}: ${fmt(v)}`);
    } else if (v && v !== 'none') {
      qualitative = true;
      parts.push(`${k}: ${v}`);
    }
  }

  panel.appendChild(note(`Target resources — ${parts.join(' · ') || 'none reported'}`));

  if (numericTotal > 0) {
    const loot = numericTotal * LOOT_FACTOR;
    const options = [];
    for (const key of ['freighter', 'bulk_carrier', 'ore_freighter']) {
      const d = shipDefs[key];
      if (d?.cargoCapacity) options.push(`${Math.ceil(loot / d.cargoCapacity)}× ${d.name}`);
    }
    panel.appendChild(note(`Cargo for ~${LOOT_FACTOR * 100}% loot (${fmt(loot)}): ${options.join(' or ')}`));
  } else if (qualitative) {
    panel.appendChild(note('Amounts are qualitative — higher spy power gives numbers and a cargo estimate.'));
  }
}

coordInputHandler(document.getElementById('atk-system'));
coordInputHandler(document.getElementById('def-system'));

export {
  updateDistanceFromCoords, loadIntelReports, populatePlanetPicker,
  _resolvedDistanceAU, classifyDefenses, coordDistanceAU, COORD_TO_FUEL_AU,
};
