// Combat simulator tab.
//
// The game grew its own combat simulator, so this tab no longer runs a battle
// engine of its own — it builds the request the game's simulator expects, hands
// it to the background worker, and renders what comes back. That means the
// numbers move with the server's balance patches instead of drifting away from
// them, which is what killed the local engine.
//
//   GET  /api/combat-simulator/bootstrap  → ship lists, own research profile,
//                                           pirate zones, planetary-defence keys
//   POST /api/combat-simulator/simulate   → { attacker, defender } → report
//
// Both go through background.js (SIM_BOOTSTRAP / SIM_RUN); the POST has to be
// issued from a game tab, which is the background's job, not ours.

import {
  loadIntelReports, populatePlanetPicker, updateDistanceFromCoords,
} from './simulator-intel.js';

export function fmt(n) {
  return Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// Percentage bonuses the game accepts when you type them in by hand instead of
// loading your own research. Sent as fractions (12.5 → 0.125); carrierHangarLevel
// is the odd one out and goes as a 0-5 integer level.
const BONUS_FIELDS = [
  ['attackBonus', 'Attack'], ['hpBonus', 'Ship HP'], ['shipShieldBonus', 'Ship shield'],
  ['damageReduction', 'Damage reduction'], ['shieldRegen', 'Shield regen'],
  ['nanobotRepair', 'Nanobot repair'], ['phaseShieldDodge', 'Phase shield dodge'],
  ['fleetTactics', 'Fleet tactics'], ['armorPierce', 'Armour pierce'],
  ['torpedoBonus', 'Torpedo'], ['ionDisableChance', 'Ion disable chance'],
  ['laserAttackBonus', 'Laser attack'], ['kineticAttackBonus', 'Kinetic attack'],
  ['plasmaAttackBonus', 'Plasma attack'], ['missileAttackBonus', 'Missile attack'],
  ['ionAttackBonus', 'Ion attack'], ['bomberAttackBonus', 'Bomber attack'],
  ['dreadnoughtAttackBonus', 'Dreadnought attack'],
];

const CARRIER_MAX = 5;

// The bootstrap payload, and lookups built from it. Everything else in this file
// reads ships through these rather than a local stat table.
let boot = null;
const shipById = new Map();
const imageById = new Map();

// An <img> for a ship, or null when we have no picture for that id. Missing
// images are non-fatal: a broken thumbnail removes itself and leaves the glyph.
function shipImage(id) {
  const url = imageById.get(Number(id));
  if (!url) return null;
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.loading = 'lazy';
  img.onerror = () => img.remove();
  return img;
}

function iconCell(className, id) {
  const icon = document.createElement('div');
  icon.className = className;
  const img = shipImage(id);
  if (img) icon.appendChild(img);
  else icon.textContent = '▶';
  return icon;
}

export function shipDefById(id) {
  return shipById.get(Number(id)) || null;
}

// Fleet import and intel auto-fill arrive keyed by report key (`cruiser`), while
// the request is keyed by shipDefId. Player ships carry `key`, NPC ships carry
// `reportKey`; match either.
export function shipIdByKey(key) {
  if (!key) return null;
  for (const s of shipById.values()) {
    if (s.key === key || s.reportKey === key) return s.id;
  }
  return null;
}

// The ship classes present in the current pools, for the fleet-import filter.
export function shipClasses() {
  const out = new Set();
  for (const s of shipById.values()) if (s.shipClass) out.add(s.shipClass);
  return [...out].sort();
}

export function shipsForSide(side) {
  if (!boot) return [];
  const type = sideType(side);
  const pool = type === 'player' ? (boot.playerShips || []).filter(s => !s.isNpc)
    : (boot.npcShips || []).filter(s => s.isNpc);
  const pirates = new Set(boot.pirateShipIds || []);
  const list = type === 'pirate' ? pool.filter(s => pirates.has(s.id)) : pool;
  return [...list].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
}

function sideType(side) {
  return document.getElementById(`${side}-type`)?.value || 'player';
}

// ── Fleet tabs ─────────────────────────────────────────────────────────────
// Each side owns an ordered list of fleets and one active index. Only the
// active fleet is on screen — one form that gets swapped, not N stacked ones —
// so switching tabs captures the inputs into the outgoing fleet and repaints
// them from the incoming one.

let nextFleetId = 1;

function newFleet() {
  return {
    id: nextFleetId++,
    type: 'player',
    pirateZone: '',
    quantities: {},
    useOwnBonuses: false,
    attachLeadership: false,
    bonuses: {},                 // raw input strings: '' means "not stated"
    defenseLevels: {},
    defenseBonuses: { buildingHpBonus: '', planetaryDefenseBonus: '' },
  };
}

const SIDES = {
  attacker: { fleets: [newFleet()], active: 0 },
  defender: { fleets: [newFleet()], active: 0 },
};

// Every read clamps, so a removal can never leave a dangling index.
function activeFleet(side) {
  const s = SIDES[side];
  s.active = Math.max(0, Math.min(s.active, s.fleets.length - 1));
  return s.fleets[s.active];
}

function captureFleet(side) {
  const f = activeFleet(side);
  f.type = sideType(side);
  f.pirateZone = document.getElementById(`${side}-zone`)?.value || '';
  f.quantities = readQuantities(side);
  f.useOwnBonuses = document.getElementById(`${side}-own-bonuses`).checked;
  f.attachLeadership = document.getElementById(`${side}-leadership`).checked;
  f.bonuses = {};
  document.querySelectorAll(`input[data-bonus-side="${side}"]`).forEach(input => {
    f.bonuses[input.dataset.bonus] = input.value;
  });
  if (side === 'defender') {
    f.defenseLevels = {};
    document.querySelectorAll('input[data-def-key]').forEach(input => {
      f.defenseLevels[input.dataset.defKey] = input.value;
    });
    f.defenseBonuses = {
      buildingHpBonus: document.getElementById('def-building-hp-bonus').value,
      planetaryDefenseBonus: document.getElementById('def-planetary-bonus').value,
    };
  }
  return f;
}

function restoreFleet(side) {
  const f = activeFleet(side);
  const typeSel = document.getElementById(`${side}-type`);
  if (typeSel) typeSel.value = f.type;
  const zoneSel = document.getElementById(`${side}-zone`);
  if (zoneSel && f.pirateZone) zoneSel.value = f.pirateZone;
  document.getElementById(`${side}-own-bonuses`).checked = f.useOwnBonuses;
  document.getElementById(`${side}-leadership`).checked = f.attachLeadership;
  buildFleetInputs(side, f.quantities);
  document.querySelectorAll(`input[data-bonus-side="${side}"]`).forEach(input => {
    input.value = f.bonuses[input.dataset.bonus] ?? '';
  });
  if (side === 'defender') {
    document.querySelectorAll('input[data-def-key]').forEach(input => {
      input.value = f.defenseLevels[input.dataset.defKey] ?? 0;
    });
    document.getElementById('def-building-hp-bonus').value = f.defenseBonuses.buildingHpBonus ?? '';
    document.getElementById('def-planetary-bonus').value = f.defenseBonuses.planetaryDefenseBonus ?? '';
  }
  applySideVisibility(side);
  renderFleetTabs(side);
}

function selectFleet(side, index) {
  captureFleet(side);
  SIDES[side].active = index;
  restoreFleet(side);
}

function addFleet(side) {
  captureFleet(side);
  SIDES[side].fleets.push(newFleet());
  SIDES[side].active = SIDES[side].fleets.length - 1;
  restoreFleet(side);
}

function removeFleet(side, index) {
  const s = SIDES[side];
  if (s.fleets.length < 2) return;      // a side never reaches zero fleets
  const wasActive = index === s.active;
  if (!wasActive) captureFleet(side);   // the on-screen fleet is not the one going
  s.fleets.splice(index, 1);
  if (index <= s.active) s.active = Math.max(0, s.active - 1);
  restoreFleet(side);
}

const SIDE_LABEL = { attacker: 'Attacker', defender: 'Defender' };

function renderFleetTabs(side) {
  const strip = document.getElementById(`${side}-fleet-tabs`);
  if (!strip) return;
  strip.textContent = '';
  const { fleets, active } = SIDES[side];

  fleets.forEach((f, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `sim-fleet-tab ${side}${i === active ? ' active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(i === active));
    tab.append(document.createTextNode(`${SIDE_LABEL[side]} ${i + 1}`));
    tab.onclick = () => selectFleet(side, i);

    // Hidden on the last remaining fleet, so a side can never reach zero.
    if (fleets.length > 1) {
      const x = document.createElement('span');
      x.className = 'sim-fleet-tab-x';
      x.textContent = '✕';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', `Remove ${SIDE_LABEL[side]} ${i + 1}`);
      x.onclick = (e) => {
        e.stopPropagation();        // removing must not also select
        removeFleet(side, i);
      };
      tab.append(x);
    }
    strip.append(tab);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'sim-fleet-add';
  add.textContent = `+ Add ${side}`;
  add.onclick = () => addFleet(side);
  strip.append(add);

  const title = document.getElementById(side === 'attacker' ? 'atk-fleet-name' : 'def-fleet-name');
  if (title) title.textContent = `${SIDE_LABEL[side]} ${active + 1} Fleet`;
}

// ── Inputs ─────────────────────────────────────────────────────────────────

function buildFleetInputs(side, quantities) {
  const tbody = document.getElementById(`${side}-ships`);
  // Keep what was typed when the side's type changes and the same ship exists
  // in the new pool — retyping a fleet to compare it against pirates is the
  // most common reason to flip that select.
  const previous = quantities || readQuantities(side);
  tbody.textContent = '';
  for (const def of shipsForSide(side)) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'ship-name';
    tdName.textContent = def.name;

    const tdKey = document.createElement('td');
    tdKey.className = 'ship-stats';
    tdKey.textContent = [
      def.hp != null ? `${fmt(def.hp)} hp` : null,
      def.shieldHp ? `${fmt(def.shieldHp)} sh` : null,
      def.attack ? `${fmt(def.attack)} atk` : null,
      def.weaponType || null,
    ].filter(Boolean).join(' · ');

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.value = previous[def.id] || 0;
    input.dataset.side = side;
    input.dataset.shipId = def.id;
    const surv = document.createElement('span');
    surv.className = 'survivors';
    surv.dataset.survSide = side;
    surv.dataset.shipId = def.id;
    tdInput.append(input, surv);

    tr.append(tdName, tdKey, tdInput);
    tbody.appendChild(tr);
  }
}

function buildBonusInputs(side) {
  const grid = document.getElementById(`${side}-bonuses`);
  grid.textContent = '';

  const carrier = document.createElement('label');
  carrier.append('Carrier operations (0-5)');
  const carrierInput = document.createElement('input');
  carrierInput.type = 'number';
  carrierInput.className = 'tech-input';
  carrierInput.min = 0;
  carrierInput.max = CARRIER_MAX;
  carrierInput.placeholder = '0';
  carrierInput.dataset.bonusSide = side;
  carrierInput.dataset.bonus = 'carrierHangarLevel';
  carrier.appendChild(carrierInput);
  grid.appendChild(carrier);

  for (const [key, label] of BONUS_FIELDS) {
    const wrap = document.createElement('label');
    wrap.append(`${label} %`);
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tech-input';
    input.step = '0.1';
    input.placeholder = '0';
    input.dataset.bonusSide = side;
    input.dataset.bonus = key;
    wrap.appendChild(input);
    grid.appendChild(wrap);
  }
}

// Defence levels are the defender's alone, and the key list comes from the
// server so a new turret type does not need a code change here.
function buildDefenseInputs() {
  const grid = document.getElementById('defender-defense');
  grid.textContent = '';
  for (const d of (boot?.planetaryDefense || [])) {
    const wrap = document.createElement('label');
    wrap.append(d.name || d.key);
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tech-input';
    input.min = 0;
    input.value = 0;
    input.dataset.defKey = d.key;
    wrap.appendChild(input);
    grid.appendChild(wrap);
  }
}

function buildZoneOptions(side) {
  const sel = document.getElementById(`${side}-zone`);
  sel.textContent = '';
  for (const z of (boot?.pirateZones || [])) {
    const key = typeof z === 'string' ? z : z.key;
    const o = document.createElement('option');
    o.value = key;
    o.textContent = (typeof z === 'string' ? z : z.name || z.key).replace(/_/g, ' ');
    sel.appendChild(o);
  }
}

function readQuantities(side) {
  const out = {};
  document.querySelectorAll(`input[data-side="${side}"][data-ship-id]`).forEach(input => {
    const qty = Math.max(0, parseInt(input.value, 10) || 0);
    if (qty > 0) out[input.dataset.shipId] = qty;
  });
  return out;
}

// Only fields the user actually filled are sent — an empty box means "no bonus
// stated", which is not the same as zero to the server's validator.
function readBonuses(side) {
  const out = {};
  document.querySelectorAll(`input[data-bonus-side="${side}"]`).forEach(input => {
    const raw = input.value.trim();
    if (raw === '') return;
    const key = input.dataset.bonus;
    out[key] = key === 'carrierHangarLevel'
      ? Math.min(CARRIER_MAX, Math.max(0, Math.floor(Number(raw) || 0)))
      : (Number(raw) || 0) / 100;
  });
  return out;
}

function readDefenseLevels() {
  const out = {};
  document.querySelectorAll('input[data-def-key]').forEach(input => {
    const lvl = Math.max(0, Math.floor(Number(input.value) || 0));
    if (lvl > 0) out[input.dataset.defKey] = lvl;
  });
  return out;
}

// The game's simulator is 1-versus-1: `{ attacker, defender }`, one `bonuses`
// object, one type and one leadership flag per side. Several fleets on a side
// therefore go as one coalition — quantities summed — and any setting they
// disagree on is a conflict the request cannot carry.
export function mergeSideFleets(fleets) {
  const list = fleets || [];
  const conflicts = [];
  const first = list[0] || {};
  const same = (get, label) => {
    if (list.some(f => JSON.stringify(get(f)) !== JSON.stringify(get(first)))) conflicts.push(label);
  };
  same(f => f.type, 'ship type (player / NPC / pirate)');
  same(f => f.useOwnBonuses, 'the "use my own research" toggle');
  same(f => f.attachLeadership, 'the leadership toggle');
  same(f => f.bonuses, 'manual bonuses');
  if (first.type === 'pirate') same(f => f.pirateZone, 'pirate zone');

  const totals = {};
  for (const f of list) {
    for (const [id, qty] of Object.entries(f.quantities || {})) {
      totals[id] = (totals[id] || 0) + (Number(qty) || 0);
    }
  }
  return {
    conflicts,
    fleet: Object.entries(totals)
      .filter(([, quantity]) => quantity > 0)
      .map(([shipDefId, quantity]) => ({ shipDefId: Number(shipDefId), quantity })),
  };
}

// One side of the request, shaped exactly as the game's own simulator sends it.
function buildSide(side) {
  captureFleet(side);                       // fold the on-screen inputs back in
  const { fleet, conflicts } = mergeSideFleets(SIDES[side].fleets);
  const type = sideType(side);
  const useOwnBonuses = type === 'player' && document.getElementById(`${side}-own-bonuses`).checked;
  const attachLeadership = type === 'player' && document.getElementById(`${side}-leadership`).checked;
  const levels = side === 'defender' && type === 'player' ? readDefenseLevels() : {};
  const pct = id => (Number(document.getElementById(id)?.value) || 0) / 100;

  return {
    conflicts,
    type,
    fleet,
    bonuses: type === 'player' && !useOwnBonuses ? readBonuses(side) : undefined,
    useOwnBonuses,
    attachLeadership,
    pirateZone: type === 'pirate' ? document.getElementById(`${side}-zone`).value : undefined,
    hangarAssignments: type === 'player' ? {} : undefined,
    planetaryDefense: Object.keys(levels).length ? {
      levels,
      buildingHpBonus: pct('def-building-hp-bonus'),
      planetaryDefenseBonus: pct('def-planetary-bonus'),
    } : undefined,
  };
}

// ── Results ────────────────────────────────────────────────────────────────

export function makeStatCard(label, value, valueClass) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

function spanWith(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function prettyOutcome(outcome) {
  return String(outcome || '—').replace(/_/g, ' ');
}

function outcomeClass(outcome) {
  const o = String(outcome || '');
  if (o.includes('attacker')) return 'win-attacker';
  if (o.includes('defender')) return 'win-defender';
  return 'win-draw';
}

function shipLabel(entry) {
  const def = entry.shipDefId != null ? shipDefById(entry.shipDefId) : null;
  return def?.name || entry.name || entry.key || 'ship';
}

// Names for ids the bootstrap does not carry — planetary defence structures and
// the leadership vessel come back with negative ids and their own names.
function namesFromReport(report) {
  const out = new Map();
  for (const list of [report.attackerLosses, report.defenderLosses,
    report.attackerSurvivors, report.defenderSurvivors, report.leadershipOutcomes]) {
    for (const e of lossEntries(list)) {
      if (e.shipDefId != null) out.set(Number(e.shipDefId), e.name || e.key);
    }
  }
  return out;
}

// The background hands back the simulation body, but tolerate the transport
// wrapper too: reading `report` off the wrapper yields an empty report, which
// renders as a battle where every ship on both sides survived — a wrong answer
// that looks like a real one.
export function simPayload(res) {
  const sim = res && res.ok && res.data ? res.data : res;
  return sim && sim.report ? sim : null;
}

// The server answers with a single `report`, and — when it ran a distribution
// rather than one battle — an `exact` outcome and/or a `summary.outcomes` tally.
function renderResults(res) {
  document.getElementById('results').style.display = '';
  const report = res.report || {};
  const outcome = res.exact?.outcome ?? report.outcome;

  const outcomeEl = document.getElementById('outcome-stats');
  outcomeEl.textContent = '';
  outcomeEl.append(makeStatCard('Outcome', prettyOutcome(outcome), outcomeClass(outcome)));

  const runs = Number(res.summary?.runs) || 0;
  const tally = res.summary?.outcomes;
  if (runs > 1 && tally) {
    const total = Object.values(tally).reduce((s, n) => s + Number(n || 0), 0) || 1;
    for (const [key, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
      if (!Number(n)) continue;
      outcomeEl.append(makeStatCard(prettyOutcome(key),
        `${(Number(n) / total * 100).toFixed(1)}%`, outcomeClass(key)));
    }
  }
  const rounds = res.exact?.rounds ?? res.summary?.averageRounds ?? (report.rounds || []).length;
  outcomeEl.append(makeStatCard('Rounds',
    typeof rounds === 'number' && !Number.isInteger(rounds) ? rounds.toFixed(1) : String(rounds), 'missions'));
  if (res.scale && res.scale.mode === 'scaled') {
    outcomeEl.append(makeStatCard('Scaled', `÷${fmt(Number(res.scale.factor) || 1)} — estimates`, 'win-draw'));
  }
  if (report.attackerRetreated) outcomeEl.append(makeStatCard('Attacker', 'retreated', 'win-defender'));
  if (report.defenderRetreated) outcomeEl.append(makeStatCard('Defender', 'retreated', 'win-attacker'));
  if (report.shieldAbsorbedDamage) {
    outcomeEl.append(makeStatCard('Shield absorbed', fmt(report.shieldAbsorbedDamage), 'hydrogen'));
  }

  for (const l of (report.leadershipOutcomes || [])) {
    const hull = Number(l.hullAfter);
    const max = Number(l.hullMax) || 0;
    outcomeEl.append(makeStatCard(l.name || 'Leadership',
      l.destroyed ? 'destroyed' : max ? `${Math.round(Math.max(0, hull) / max * 100)}% hull` : 'survived',
      l.destroyed ? 'win-defender' : 'win-attacker'));
  }

  renderFleetResultCards(report);
  renderLossRows('attacker-losses', report.attackerLosses);
  renderLossRows('defender-losses', report.defenderLosses);
  updateSurvivors('attacker', report.attackerLosses);
  updateSurvivors('defender', report.defenderLosses);
  renderRounds(report.rounds);
  renderDebris(report.debris);
}

// The game's own client maps over these as an array, while docs/api renders
// them as a `{}`; take either, since one live shape change should not blank the
// whole result panel.
export function lossEntries(losses) {
  if (Array.isArray(losses)) return losses;
  return Object.entries(losses || {}).map(([key, v]) => (
    v && typeof v === 'object' ? { key, ...v } : { key, lost: Number(v) || 0 }
  ));
}

// Rows for one side's result card: everything we sent, plus anything the server
// mentions that we did not (planetary defence, the leadership vessel). Pure, so
// the union and the survivor fallback are testable against a captured report.
export function fleetRows(sent, survivors, losses) {
  const surv = survivorMap(survivors);
  const lost = lossMap(losses);
  const ids = new Set([...Object.keys(sent || {}).map(Number), ...surv.keys(), ...lost.keys()]);
  return [...ids].map(id => {
    const dead = lost.get(id) || 0;
    const sentQty = (sent || {})[id];
    return {
      shipDefId: id,
      sent: sentQty ?? ((surv.get(id) || 0) + dead),
      lost: dead,
      // The server lists survivors explicitly; a ship missing from that list
      // simply had none left, so only fall back when it says nothing at all.
      remain: surv.has(id) ? surv.get(id) : Math.max(0, (sentQty || 0) - dead),
    };
  });
}

function survivorMap(survivors) {
  const out = new Map();
  for (const s of (survivors || [])) {
    const id = s.shipDefId != null ? Number(s.shipDefId) : shipIdByKey(s.key);
    if (id != null) out.set(id, Number(s.quantity) || 0);
  }
  return out;
}

function lossMap(losses) {
  const out = new Map();
  for (const l of lossEntries(losses)) {
    const id = l.shipDefId != null ? Number(l.shipDefId) : shipIdByKey(l.key);
    if (id != null) out.set(id, Number(l.lost) || 0);
  }
  return out;
}

function renderFleetResultCards(report) {
  const el = document.getElementById('fleet-results');
  el.textContent = '';
  const names = namesFromReport(report);
  const sides = [
    { side: 'attacker', label: 'Attacker', icon: '⚡', losses: report.attackerLosses, survivors: report.attackerSurvivors },
    { side: 'defender', label: 'Defender', icon: '⛨', losses: report.defenderLosses, survivors: report.defenderSurvivors },
  ];
  for (const s of sides) {
    const card = document.createElement('div');
    card.className = `sim-fleet-card ${s.side}`;

    const head = document.createElement('div');
    head.className = 'sim-fleet-card-head';
    head.append(
      Object.assign(document.createElement('div'), { className: 'sim-fleet-card-side', textContent: `${s.icon} ${s.label}` }),
      Object.assign(document.createElement('div'), { className: 'sim-fleet-card-name', textContent: `${s.label} Fleet` }),
    );

    const rows = document.createElement('div');
    rows.className = 'sim-fleet-card-rows';
    const entries = fleetRows(readQuantities(s.side), s.survivors, s.losses);
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'sim-fleet-card-empty';
      empty.textContent = 'No ships';
      rows.appendChild(empty);
    } else {
      for (const { shipDefId: id, lost, remain } of entries) {
        const row = document.createElement('div');
        row.className = 'sim-fleet-card-row';
        row.append(
          iconCell('sim-fleet-card-icon', id),
          spanWith('sim-fleet-card-name-cell', shipDefById(id)?.name || names.get(id) || String(id)),
          spanWith('sim-fleet-card-lost', `-${fmt(lost)}`),
          Object.assign(spanWith('sim-fleet-card-remain', fmt(remain)),
            { className: `sim-fleet-card-remain ${remain > 0 ? 'alive' : 'wiped'}` }),
        );
        rows.appendChild(row);
      }
    }
    card.append(head, rows);
    el.appendChild(card);
  }
}

function renderLossRows(containerId, losses) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  const entries = lossEntries(losses).filter(l => (Number(l.lost) || 0) > 0);
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'sim-loss-empty';
    empty.textContent = 'No losses';
    container.appendChild(empty);
    return;
  }
  for (const l of entries) {
    const row = document.createElement('div');
    row.className = 'sim-loss-row';
    row.append(
      iconCell('sim-loss-icon', l.shipDefId != null ? l.shipDefId : shipIdByKey(l.key)),
      spanWith('sim-loss-qty', `${fmt(l.lost)}× ${shipLabel(l)}`),
    );
    // destroyed + damaged only appear on the real report; `lost` is their sum.
    if (l.destroyed != null || l.damaged != null) {
      row.append(spanWith('sim-loss-detail',
        `(${fmt(l.destroyed || 0)} destroyed, ${fmt(l.damaged || 0)} damaged)`));
    }
    container.appendChild(row);
  }
}

function updateSurvivors(side, losses) {
  const lost = lossMap(losses);
  const sent = readQuantities(side);
  document.querySelectorAll(`.survivors[data-surv-side="${side}"]`).forEach(span => {
    const id = Number(span.dataset.shipId);
    const q = sent[id] || 0;
    if (!q) { span.textContent = ''; return; }
    const alive = Math.max(0, q - (lost.get(id) || 0));
    span.textContent = `→ ${fmt(alive)} alive`;
    span.style.color = alive >= q ? 'var(--color-success)'
      : alive > 0 ? 'var(--color-warning)' : 'var(--color-danger)';
  });
}

// One card per round, from the report's per-side events: damage dealt, and what
// each side destroyed that round.
function renderRounds(rounds) {
  const list = document.getElementById('rounds-log');
  list.textContent = '';
  const all = rounds || [];
  const countEl = document.getElementById('rounds-count');
  if (countEl) countEl.textContent = all.length ? `(${all.length})` : '';

  for (const r of all) {
    const events = r.events || [];
    const dmgFor = side => events.filter(e => e.side === side)
      .reduce((s, e) => s + (Number(e.totalDamage) || 0), 0);
    // A side's own event lists what IT destroyed, so the attacker's losses are
    // what the defender's events report.
    const killsBy = side => events.filter(e => e.side === side)
      .flatMap(e => e.shipsDestroyed || [])
      .filter(s => (Number(s.lost) || 0) > 0);

    const card = document.createElement('div');
    card.className = 'sim-round-card';

    const top = document.createElement('div');
    top.className = 'sim-round-top';
    const summary = document.createElement('div');
    summary.className = 'sim-round-summary';
    summary.append(
      spanWith('sim-round-n', `Round ${r.round}:`),
      (() => {
        const dmg = document.createElement('span');
        dmg.className = 'sim-round-dmg';
        dmg.append(' ', spanWith('sword', '⚔'), ` ${fmt(dmgFor('attacker'))} dmg → `,
          spanWith('shield', '⛨'), ` ${fmt(dmgFor('defender'))} dmg`);
        return dmg;
      })(),
    );
    top.appendChild(summary);

    const shieldPct = (hp, max) => (max > 0 ? ` ⛨${Math.round(Math.max(0, hp) / max * 100)}%` : '');
    const pctEl = document.createElement('span');
    pctEl.className = 'sim-round-pct';
    pctEl.textContent =
      `[ATK ${Math.round(Number(r.attackerHpPercent) || 0)}%` +
      `${shieldPct(Number(r.attackerShieldHp) || 0, Number(r.attackerShieldMaxHp) || 0)} / ` +
      `DEF ${Math.round(Number(r.defenderHpPercent) || 0)}%` +
      `${shieldPct(Number(r.defenderShieldHp) || 0, Number(r.defenderShieldMaxHp) || 0)}]`;
    top.appendChild(pctEl);

    const losses = document.createElement('div');
    losses.className = 'sim-round-losses';
    const detail = list2 => list2.map(s => `${fmt(s.lost)}× ${shipLabel(s)}`).join(', ');
    const attackerLost = killsBy('defender');
    const defenderLost = killsBy('attacker');
    if (attackerLost.length) {
      losses.append(Object.assign(document.createElement('div'),
        { className: 'sim-round-loss-a', textContent: `✕ Lost: ${detail(attackerLost)}` }));
    }
    if (defenderLost.length) {
      losses.append(Object.assign(document.createElement('div'),
        { className: 'sim-round-loss-d', textContent: `⛨ Lost: ${detail(defenderLost)}` }));
    }

    card.append(top, losses);
    list.appendChild(card);
  }
}

// Debris comes from the server, rather than our old flat 30% of losses, and a
// real field can include rares (cryo_ice, quantum_dust, plasma_core), so render
// whatever keys came back instead of a fixed three.
const DEBRIS_ORDER = ['ore', 'silicates', 'alloys'];

function renderDebris(debris) {
  const el = document.getElementById('debris-stats');
  el.textContent = '';
  const d = debris || {};
  const keys = [
    ...DEBRIS_ORDER.filter(k => k in d),
    ...Object.keys(d).filter(k => !DEBRIS_ORDER.includes(k)).sort(),
  ];
  if (!keys.length) keys.push(...DEBRIS_ORDER);
  for (const key of keys) {
    const item = document.createElement('div');
    item.className = 'sim-debris-item';
    const label = key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    item.append(spanWith('sim-debris-value', fmt(Number(d[key]) || 0)), spanWith('sim-debris-label', ` ${label}`));
    el.appendChild(item);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

let initPromise = null;

function applySideVisibility(side) {
  const type = sideType(side);
  const isPlayer = type === 'player';
  document.getElementById(`${side}-zone-wrap`).style.display = type === 'pirate' ? '' : 'none';
  document.getElementById(`${side}-player-opts`).style.display = isPlayer ? '' : 'none';
  const own = document.getElementById(`${side}-own-bonuses`).checked && isPlayer;
  document.getElementById(`${side}-bonuses`).style.display = own ? 'none' : '';
  if (side === 'defender') {
    document.getElementById('defender-defense-box').style.display = isPlayer ? '' : 'none';
  }
}

function wireSide(side) {
  document.getElementById(`${side}-type`).addEventListener('change', () => {
    buildFleetInputs(side);
    applySideVisibility(side);
  });
  document.getElementById(`${side}-own-bonuses`).addEventListener('change', () => applySideVisibility(side));
}

export function initSimulatorTab() {
  if (!initPromise) initPromise = doInitSimulatorTab();
  return initPromise;
}

async function doInitSimulatorTab() {
  const status = document.getElementById('sim-status');
  status.textContent = 'Loading the game\'s simulator…';
  const res = await browser.runtime.sendMessage({ type: 'SIM_BOOTSTRAP' });
  if (!res || res.error) {
    status.textContent = `Could not load the game's combat simulator: ${res?.error || 'no answer'}. ` +
      'Open the game in a tab, logged in, and reopen this tab.';
    status.className = 'error';
    initPromise = null;   // let a later visit retry rather than sitting dead
    return;
  }

  boot = res;
  shipById.clear();
  for (const s of [...(boot.playerShips || []), ...(boot.npcShips || [])]) shipById.set(s.id, s);

  // Thumbnails come from the scraped ship defs, which are keyed by the same
  // shipDefId the simulator uses. Not having them is not worth failing over.
  imageById.clear();
  const defs = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
  for (const s of (defs?.ships || [])) {
    if (s.imageUrl) imageById.set(Number(s.shipDefId), s.imageUrl);
  }

  // The server says whether it can apply the caller's real research; without it
  // the toggle would send useOwnBonuses on an account that has none.
  if (boot.ownProfile && boot.ownProfile.bonusesAvailable === false) {
    for (const side of ['attacker', 'defender']) {
      const box = document.getElementById(`${side}-own-bonuses`);
      box.checked = false;
      box.disabled = true;
      box.parentElement.title = 'The game reports no bonuses available for your account.';
    }
  }
  if (!boot.ownProfile?.leadership?.available) {
    for (const side of ['attacker', 'defender']) {
      const box = document.getElementById(`${side}-leadership`);
      box.checked = false;
      box.disabled = true;
      box.parentElement.title = 'No leadership vessel available on your account.';
    }
  }

  for (const side of ['attacker', 'defender']) {
    buildZoneOptions(side);
    buildBonusInputs(side);
    buildFleetInputs(side);
    wireSide(side);
    applySideVisibility(side);
  }
  buildDefenseInputs();
  for (const side of ['attacker', 'defender']) renderFleetTabs(side);

  const classSel = document.getElementById('fleet-class');
  for (const c of shipClasses()) {
    const o = document.createElement('option');
    o.value = c;
    o.textContent = c[0].toUpperCase() + c.slice(1);
    classSel.appendChild(o);
  }

  await Promise.all([loadIntelReports(), populatePlanetPicker()]);
  const own = boot.ownProfile?.carrierOperationsLevel;
  status.textContent = `${shipById.size} ship types loaded from the game` +
    (own != null ? ` · your carrier operations level ${own}` : '') + '.';
}

document.getElementById('btn-run').addEventListener('click', async function () {
  const status = document.getElementById('sim-status');
  if (!boot) { status.textContent = 'Simulator data not loaded yet.'; return; }

  const attacker = buildSide('attacker');
  const defender = buildSide('defender');
  const clash = [
    ...attacker.conflicts.map(c => `attacker fleets disagree on ${c}`),
    ...defender.conflicts.map(c => `defender fleets disagree on ${c}`),
  ];
  if (clash.length) {
    // The game's calculator takes one settings block per side, so this cannot
    // be sent as-is. Better to say so than to quietly use fleet 1's settings.
    status.textContent = `${clash.join('; ')}. Several fleets on one side fight as a coalition, ` +
      'so they must share those settings.';
    return;
  }
  delete attacker.conflicts;
  delete defender.conflicts;
  if (!attacker.fleet.length) { status.textContent = 'Attacker needs at least one ship.'; return; }
  if (!defender.fleet.length && !defender.planetaryDefense) {
    status.textContent = 'Defender needs ships, or a planetary defence level.';
    return;
  }

  this.disabled = true;
  status.textContent = 'Asking the game to simulate…';
  await updateDistanceFromCoords();
  try {
    const raw = await browser.runtime.sendMessage({ type: 'SIM_RUN', attacker, defender });
    if (!raw || raw.error) {
      status.textContent = raw?.error || 'The game returned nothing.';
      return;
    }
    const res = simPayload(raw);
    if (!res) {
      status.textContent = 'The game answered, but the reply carried no combat report.';
      return;
    }
    renderResults(res);
    // A scaled run means the server fought a smaller battle and extrapolated
    // damage, losses, survivors and debris — the user has to know that.
    status.textContent = res.scale?.mode === 'scaled'
      ? `Simulated by the game, scaled ÷${fmt(Number(res.scale.factor) || 1)} — losses and debris are estimates.`
      : `Simulated by the game — ${(res.report?.rounds || []).length} rounds.`;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  } finally {
    this.disabled = false;
  }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  for (const side of ['attacker', 'defender']) activeFleet(side).quantities = {};
  document.querySelectorAll('.fleet-table input').forEach(i => { i.value = 0; });
  document.querySelectorAll('.survivors').forEach(s => { s.textContent = ''; });
  document.getElementById('results').style.display = 'none';
});
