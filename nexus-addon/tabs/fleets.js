// Fleets tab: named fleet templates, reusable by any task (mining a field,
// collecting gas, future jobs). A template is planet-agnostic — ship quantities
// keyed by shipDefId. Stored under `fleet_templates`.

let inited = false;
let templates = [];          // [{ id, name, ships: { shipDefId: qty } }]
let shipDefs = [];           // catalog: [{ shipDefId, name, shipClass, miningCargo, attack, ... }]
let currentId = null;        // template open in the editor

// Grouping mirrors the simulator's attacker fleet.
const GROUP_ORDER = ['combat', 'special', 'recon', 'utility'];
const GROUP_LABELS = { combat: 'Combat', special: 'Special', recon: 'Recon', utility: 'Utility' };

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

export async function renderFleetsTab() {
  if (inited) return;
  inited = true;

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
    if (s.miningCargo) tdName.style.color = '#e3b341';

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.textContent = statText(s);

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = t.ships[s.shipDefId] || '';
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10) || 0;
      if (v > 0) t.ships[s.shipDefId] = v; else delete t.ships[s.shipDefId];
      save();
    });
    tdInput.appendChild(input);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}
