// Fleets tab: named fleet templates, reusable by any task (mining a field,
// collecting gas, future jobs). A template is planet-agnostic — ship quantities
// keyed by shipDefId. Stored under `fleet_templates`.
//
// Templates can be tagged as escort for specific zones via `escortZones: string[]`
// (values: 'sentinel', 'open', 'dead', 'rift'). The fleet editor uses these to
// show per-template coloured buttons for escort optimisation.

let inited = false;
let templates = [];          // [{ id, name, ships: { shipDefId: qty } }]
let shipDefs = [];           // catalog: [{ shipDefId, name, shipClass, miningCargo, attack, ... }]
let currentId = null;        // template open in the editor

// Grouping mirrors the simulator's attacker fleet.
const GROUP_ORDER = ['combat', 'special', 'recon', 'utility'];
const GROUP_LABELS = { combat: 'Combat', special: 'Special', recon: 'Recon', utility: 'Utility' };

// Colour + "what it mines" per mining ship (keyed by ship key), so the template
// editor shows at a glance which fields each hauler works. Colours match the
// asteroid field-type palette.
const MINING_SHIPS = {
  miner:         { name: 'Mining Vessel', color: '#f0883e', mines: 'Ore, Plasma Core' },
  gas_collector: { name: 'Gas Collector', color: '#79c0ff', mines: 'Hydrogen, Quantum Dust' },
  ice_drill:     { name: 'Ice Drill',     color: '#a5d6ff', mines: 'Cryo-Ice, Dark Matter' },
  excavator:     { name: 'Excavator',     color: '#e3b341', mines: '+20% fleet mining yield (all)' },
  freighter:     { name: 'Freighter',     color: '#8b949e', mines: 'Ore, Cryo-Ice (basic)' },
};

function statText(s) {
  return `ATK ${s.attack} · HP ${s.hp} · SH ${s.shieldHp}` +
    (s.weaponType ? ` · ${s.weaponType}` : '') +
    (s.armorType ? ` · ${s.armorType}` : '') +
    (s.miningCargo ? ` · cargo ${s.miningCargo}` : '');
}

// Load templates, migrating the legacy single `mining_template` if present.
// Exported so other tabs (Asteroids) read the same list without duplicating
// the storage key or migration.
export async function loadFleetTemplates() {
  const { fleet_templates, mining_template } =
    await browser.storage.local.get(['fleet_templates', 'mining_template']);
  if (fleet_templates && fleet_templates.length) return fleet_templates;
  if (mining_template && Object.keys(mining_template.ships || {}).length) {
    const seeded = [{ id: Date.now(), name: 'Mining', ships: mining_template.ships }];
    await browser.storage.local.set({ fleet_templates: seeded });
    return seeded;
  }
  return [];
}

async function save() {
  await browser.storage.local.set({ fleet_templates: templates });
}

// Mining-ship colour legend (built once).
function renderLegend() {
  const box = document.getElementById('ft-legend');
  if (!box || box.childElementCount) return;
  for (const { name, color, mines } of Object.values(MINING_SHIPS)) {
    const item = document.createElement('span');
    item.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';
    const sw = document.createElement('span');
    sw.style.cssText = `width:11px; height:11px; border-radius:2px; background:${color}; flex:none;`;
    const label = document.createElement('span');
    label.innerHTML = `<b style="color:${color}">${name}</b> <span style="color:#8b949e">${mines}</span>`;
    item.append(sw, label);
    box.appendChild(item);
  }
}

export async function renderFleetsTab() {
  if (inited) return;
  inited = true;
  renderLegend();

  document.getElementById('ft-new').addEventListener('click', () => {
    const t = { id: Date.now(), name: 'New template', ships: {} };
    templates.push(t);
    currentId = t.id;
    save();
    fillSelect();
    fillEditor();
  });
  document.getElementById('ft-delete').addEventListener('click', () => {
    if (currentId == null) return;
    templates = templates.filter(t => t.id !== currentId);
    currentId = templates[0] ? templates[0].id : null;
    save();
    fillSelect();
    fillEditor();
  });
  document.getElementById('ft-select').addEventListener('change', e => {
    currentId = Number(e.target.value);
    fillEditor();
  });
  document.getElementById('ft-name').addEventListener('input', e => {
    const t = current();
    if (!t) return;
    t.name = e.target.value;
    document.getElementById('ft-box-title').textContent = t.name || 'Fleet';
    save();
    fillSelect();
  });
  templates = await loadFleetTemplates();
  currentId = templates[0] ? templates[0].id : null;
  fillSelect();
  fillEditor();

  const status = document.getElementById('ft-status');
  status.textContent = 'Loading ships…';
  const res = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
  status.textContent = res.error ? `Error: ${res.error}` : '';
  shipDefs = res.ships || [];
  fillShips();
}

function current() {
  return templates.find(t => t.id === currentId) || null;
}

function fillSelect() {
  const sel = document.getElementById('ft-select');
  sel.textContent = '';
  for (const t of templates) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    if (t.id === currentId) o.selected = true;
    sel.appendChild(o);
  }
}

function fillEditor() {
  const t = current();
  document.getElementById('ft-name').value = t ? t.name : '';
  document.getElementById('ft-name').disabled = !t;
  document.getElementById('ft-delete').disabled = !t;
  document.getElementById('ft-box-title').textContent = t ? (t.name || 'Fleet') : 'Fleet';
  fillShips();
  fillEscortZones();
}

// Ship rows for the open template, grouped + styled like the simulator's
// attacker fleet: name, stat line, quantity input.
function fillShips() {
  const tbody = document.getElementById('ft-ships');
  tbody.textContent = '';
  const t = current();
  if (!t) { tbody.innerHTML = '<tr><td>Create a template to begin.</td></tr>'; return; }
  if (!shipDefs.length) { tbody.innerHTML = '<tr><td>No ships found on your planets.</td></tr>'; return; }

  const ships = shipDefs.slice().sort((a, b) =>
    GROUP_ORDER.indexOf(a.shipClass) - GROUP_ORDER.indexOf(b.shipClass) || a.sortOrder - b.sortOrder);

  let lastGroup = null;
  for (const s of ships) {
    if (s.shipClass !== lastGroup) {
      lastGroup = s.shipClass;
      const gtr = document.createElement('tr');
      gtr.className = 'ship-group';
      const gtd = document.createElement('td');
      gtd.colSpan = 3;
      gtd.textContent = GROUP_LABELS[s.shipClass] || s.shipClass;
      gtr.appendChild(gtd);
      tbody.appendChild(gtr);
    }
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'ship-name';
    tdName.textContent = s.name;
    const mine = MINING_SHIPS[s.key];
    if (mine) { tdName.style.color = mine.color; tdName.title = `Mines: ${mine.mines}`; }
    else if (s.miningCargo) tdName.style.color = '#e3b341';   // any other hauler with mining cargo

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.textContent = statText(s);

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.5';
    input.value = t.ships[s.shipDefId] != null ? String(t.ships[s.shipDefId]) : '';
    input.addEventListener('input', () => {
      const v = parseFloat(input.value) || 0;
      if (v > 0) t.ships[s.shipDefId] = v; else delete t.ships[s.shipDefId];
      save();
    });
    tdInput.appendChild(input);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}

// ── Escort Zones & Options ────────────────────────────────────────────────────
// Each template can be tagged for one or more zones so the fleet editor knows
// which escort templates to offer for a given asteroid field.
// `escortPerMiner: true` means ship quantities are ratios per mining ship, e.g.
// 2.0 = 2 escort ships required for every 1 mining ship sent.

const ZONE_DEFS = [
  { key: 'sentinel', label: 'Sentinel', color: '#56d364' },
  { key: 'open',     label: 'Open',     color: '#f0883e' },
  { key: 'dead',     label: 'Dead',     color: '#ff7b72' },
  { key: 'rift',     label: 'Rift',     color: '#bc8cff' },
];

function fillEscortZones() {
  const box = document.getElementById('ft-escort-zones');
  if (!box) return;
  box.textContent = '';
  const t = current();
  if (!t) return;

  // Zone toggle buttons.
  const escortZones = t.escortZones || [];
  for (const zone of ZONE_DEFS) {
    const active = escortZones.includes(zone.key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = zone.label;
    btn.style.cssText = [
      'padding:4px 12px',
      'border-radius:6px',
      `border:1px solid ${zone.color}`,
      `background:${active ? zone.color : 'transparent'}`,
      `color:${active ? '#1b2030' : zone.color}`,
      'cursor:pointer',
      'font-size:0.82rem',
      'font-weight:600',
    ].join(';');
    btn.title = `Tag this template as an escort fleet for ${zone.label} zone`;
    btn.addEventListener('click', () => {
      const idx = (t.escortZones || []).indexOf(zone.key);
      if (idx === -1) { t.escortZones = [...(t.escortZones || []), zone.key]; }
      else { t.escortZones = (t.escortZones || []).filter(z => z !== zone.key); }
      save();
      fillEscortZones();
    });
    box.append(btn);
  }

  // "Per mining ship" toggle — only useful when zones are configured.
  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px; background:#30363d; align-self:stretch; margin:0 4px;';
  box.append(sep);

  const label = document.createElement('label');
  label.style.cssText = 'display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; color:#8b949e; cursor:pointer; user-select:none;';
  label.title = 'Treat ship quantities as ratios: multiply by the number of mining ships in the fleet to get the required escort count.';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = !!t.escortPerMiner;
  chk.addEventListener('change', () => {
    t.escortPerMiner = chk.checked;
    save();
  });
  label.append(chk, document.createTextNode('Per mining ship'));
  box.append(label);
}
