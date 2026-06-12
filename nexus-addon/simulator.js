// Combat simulator based on https://s0.nexuslegacy.space/guide/combat.html
//
// The guide deliberately hides exact numbers ("the numbers live in the combat
// engine and are subject to balance changes"), so the multiplier tables below
// are estimates: the weapon-vs-armor shape comes straight from the guide's
// matrix, rapid-fire values from ship descriptions where given, otherwise
// guessed conservatively. Debris rate (30% of destroyed ship cost) was
// calibrated against real pirate battle reports.

// Guide matrix: Strong=1.5, Good=1.25, Neutral=1.0, Weak=0.75, Very Strong=2.0
const WEAPON_VS_ARMOR = {
  kinetic: { light: 1.5,  medium: 1.0,  heavy: 0.75, shielded: 0.75 },
  laser:   { light: 1.0,  medium: 1.0,  heavy: 1.0,  shielded: 1.0  },
  plasma:  { light: 0.75, medium: 1.0,  heavy: 0.75, shielded: 1.5  },
  missile: { light: 1.25, medium: 1.5,  heavy: 1.25, shielded: 0.75 },
  ion:     { light: 0.75, medium: 0.75, heavy: 0.75, shielded: 2.0  },
};

// "Plasma … chews through shield HP faster", "Ion … great at burning down shield HP"
const SHIELD_BURN = { plasma: 1.5, ion: 2.0 };

// Shots per round vs specific targets. Sources: ship descriptions (exact where
// stated) and the guide's hard-counter
const RAPID_FIRE = {
  interceptor:     { fighter: 5, probe: 5, spy_probe: 5, scout: 5 },
  cruiser:         { fighter: 5, scout: 5, interceptor: 5 },           // desc: ×5 fighters; guide: hunts scouts+interceptors too
  torpedo_frigate: { battleship: 3, dreadnought: 2, titan: 2 },
  battleship:      { cruiser: 4, missile_cruiser: 4 },
  missile_cruiser: { fighter: 5, interceptor: 4, bomber: 3 },
  // Dreadnought & titan values are exact, read from the in-game ship screens.
  dreadnought:     { cruiser: 5, bomber: 4, battleship: 3, missile_cruiser: 3, fighter: 3, interceptor: 2, carrier: 2 },
  titan:           { scout: 20, fighter: 15, interceptor: 10, cruiser: 8, battleship: 5, missile_cruiser: 5, bomber: 5, carrier: 5, dreadnought: 3 },
};

function rapidFireShots(attackerKey, targetKey) {
  const rf = RAPID_FIRE[attackerKey];
  if (!rf) return 1;
  return rf[targetKey] || 1;
}

// Combat research from /api/research. All rates exact, read from the in-game
// research screens. All max level 5. Bonuses within a category add up, then
// apply as one multiplier. `also` is a second effect of the same tech
// (Advanced Shielding boosts shield HP and reduces damage).
const TECHS = [
  { key: 'kinetic_weapons',    name: 'Kinetic Weapons',     group: 'Weapons', perLvl: 0.03, applies: 'weapon', weapon: 'kinetic' },
  { key: 'laser_weapons',      name: 'Laser Weapons',       group: 'Weapons', perLvl: 0.03, applies: 'weapon', weapon: 'laser' },
  { key: 'plasma_weapons',     name: 'Plasma Weapons',      group: 'Weapons', perLvl: 0.03, applies: 'weapon', weapon: 'plasma' },
  { key: 'missile_systems',    name: 'Missile Systems',     group: 'Weapons', perLvl: 0.02, applies: 'weapon', weapon: 'missile' },
  { key: 'torpedo_systems',    name: 'Torpedo Systems',     group: 'Weapons', perLvl: 0.02, applies: 'weapon', weapon: 'missile' },
  { key: 'ion_cannons',        name: 'Ion Cannons',         group: 'Weapons', perLvl: 0.02, applies: 'weapon', weapon: 'ion' },
  { key: 'fighter_doctrine',   name: 'Fighter Doctrine',    group: 'Weapons', perLvl: 0.02, applies: 'weapon', weapon: 'laser' },
  { key: 'bomber_wing',        name: 'Bomber Wing',         group: 'Weapons', perLvl: 0.02, applies: 'ship', ship: 'bomber' },
  { key: 'weapons_overcharge', name: 'Weapons Overcharge',  group: 'Weapons', perLvl: 0.03, applies: 'weapon_all' },
  { key: 'basic_armor',        name: 'Basic Armor Plating', group: 'Hull',    perLvl: 0.02, applies: 'hull' },
  { key: 'composite_armor',    name: 'Composite Armor',     group: 'Hull',    perLvl: 0.03, applies: 'hull' },
  { key: 'heavy_armor',        name: 'Heavy Armor',         group: 'Hull',    perLvl: 0.03, applies: 'hull' },
  { key: 'ship_mastery',       name: 'Ship Mastery',        group: 'Hull',    perLvl: 0.02, applies: 'hull' },
  { key: 'shield_theory',      name: 'Shield Theory',       group: 'Shield',  perLvl: 0.02, applies: 'damage_reduction' },
  { key: 'advanced_shielding', name: 'Advanced Shielding',  group: 'Shield',  perLvl: 0.10, applies: 'shield',
    also: { perLvl: 0.02, applies: 'damage_reduction' } },
  { key: 'adaptive_shields',   name: 'Adaptive Shields',    group: 'Shield',  perLvl: 0.03, applies: 'damage_reduction' },
];
const TECH_MAX_LEVEL = 5;

// levels: { techKey: level } → additive bonus pools used by buildInstances
function computeMods(levels) {
  const mods = {
    weapon: { kinetic: 0, laser: 0, plasma: 0, missile: 0, ion: 0 },
    weaponAll: 0,
    ship: {},            // per-ship-key attack bonus (e.g. bomber_wing)
    hull: 0,
    shield: 0,
    damageReduction: 0,  // fraction of incoming damage negated
  };
  const apply = (effect, lvl) => {
    const bonus = lvl * effect.perLvl;
    if (!bonus) return;
    if (effect.applies === 'weapon') mods.weapon[effect.weapon] += bonus;
    else if (effect.applies === 'weapon_all') mods.weaponAll += bonus;
    else if (effect.applies === 'ship') mods.ship[effect.ship] = (mods.ship[effect.ship] || 0) + bonus;
    else if (effect.applies === 'hull') mods.hull += bonus;
    else if (effect.applies === 'shield') mods.shield += bonus;
    else if (effect.applies === 'damage_reduction') mods.damageReduction += bonus;
  };
  for (const tech of TECHS) {
    const lvl = levels[tech.key] || 0;
    apply(tech, lvl);
    if (tech.also) apply(tech.also, lvl);
  }
  return mods;
}

const NO_MODS = computeMods({});

let shipDefs = {};   // key → def (from storage, built by background scrape)

// ── Simulation engine ──────────────────────────────────────────────────────

// fleet: { shipKey: quantity } → array of live ship instances.
// mods: output of computeMods (research bonuses).
function buildInstances(fleet, mods) {
  const m = mods || NO_MODS;
  const out = [];
  for (const [key, qty] of Object.entries(fleet)) {
    const def = shipDefs[key];
    if (!def || !qty) continue;
    const attackBonus = (m.weapon[def.weaponType] || 0) + m.weaponAll + (m.ship[key] || 0);
    const maxHp = def.hp * (1 + m.hull);
    const maxShield = def.shieldHp * (1 + m.shield);
    const attack = def.attack * (1 + attackBonus);
    const drMult = 1 - m.damageReduction;
    for (let i = 0; i < qty; i++) {
      out.push({ key, hp: maxHp, shield: maxShield, maxShield, attack, drMult, def });
    }
  }
  return out;
}

// One side fires at the other. Targets are picked from the alive-at-round-start
// snapshot; hull damage lands immediately but deaths are culled after both
// sides have fired (simultaneous fire per the guide).
//
// Targeting: weakest of 2 random candidates, plus a 3rd candidate 50% of the
// time. This partial focus-fire was calibrated against two real battle
// reports: 10 interceptors vs 8 scouts + 4 fighters → 0 attacker losses,
// and 22 scouts vs 5 fighters + 4 scouts → ~2 attacker losses.
function pickTarget(targets) {
  let t = targets[Math.floor(Math.random() * targets.length)];
  const candidates = Math.random() < 0.5 ? 3 : 2;
  for (let c = 1; c < candidates; c++) {
    const cand = targets[Math.floor(Math.random() * targets.length)];
    if (cand.hp + cand.shield < t.hp + t.shield) t = cand;
  }
  return t;
}

function fireVolley(shooters, targets, opts) {
  if (!targets.length) return;
  for (const s of shooters) {
    if (s.hp <= 0) continue;            // destroyed in prior rounds only; this round's hull damage is applied after both volleys (simultaneous fire).
    const atk = s.attack;
    if (!atk || !s.def.weaponType) continue;
    const t = pickTarget(targets);
    const shots = rapidFireShots(s.key, t.key);
    const mult = (WEAPON_VS_ARMOR[s.def.weaponType] || {})[t.def.armorType] ?? 1.0;
    const burn = SHIELD_BURN[s.def.weaponType] || 1.0;
    for (let i = 0; i < shots; i++) {
      const variance = 1 + (Math.random() * 2 - 1) * opts.variance;
      let dmg = atk * mult * variance * t.drMult;
      if (t.shield > 0) {
        const absorbed = Math.min(t.shield, dmg * burn);
        t.shield -= absorbed;
        dmg -= absorbed / burn;
      }
      if (dmg > 0) t.pendingHull = (t.pendingHull || 0) + dmg;
    }
  }
}

function applyPending(instances) {
  for (const s of instances) {
    if (s.pendingHull) {
      s.hp -= s.pendingHull;
      s.pendingHull = 0;
    }
  }
  return instances.filter(s => s.hp > 0);
}

function simulateOnce(attackerFleet, defenderFleet, opts) {
  let attackers = buildInstances(attackerFleet, opts.attackerMods);
  let defenders = buildInstances(defenderFleet, opts.defenderMods);
  let rounds = 0;

  while (attackers.length && defenders.length && rounds < opts.maxRounds) {
    rounds++;
    if (opts.shieldRegen) {
      for (const s of attackers) s.shield = s.maxShield;
      for (const s of defenders) s.shield = s.maxShield;
    }
    fireVolley(attackers, defenders, opts);
    fireVolley(defenders, attackers, opts);
    attackers = applyPending(attackers);
    defenders = applyPending(defenders);
  }

  let outcome;
  if (!attackers.length && !defenders.length) outcome = 'mutual_destruction';
  else if (!defenders.length) outcome = 'attacker_won';
  else if (!attackers.length) outcome = 'defender_won';
  else outcome = 'defender_held'; // round cap reached — defender holds the field

  const count = arr => arr.reduce((m, s) => { m[s.key] = (m[s.key] || 0) + 1; return m; }, {});
  return { outcome, rounds, attackersLeft: count(attackers), defendersLeft: count(defenders) };
}

function runSimulations(attackerFleet, defenderFleet, opts) {
  const outcomes = { attacker_won: 0, defender_won: 0, defender_held: 0, mutual_destruction: 0 };
  let totalRounds = 0;
  const survivorSums = { attacker: {}, defender: {} };

  for (let i = 0; i < opts.sims; i++) {
    const r = simulateOnce(attackerFleet, defenderFleet, opts);
    outcomes[r.outcome]++;
    totalRounds += r.rounds;
    for (const [k, n] of Object.entries(r.attackersLeft)) survivorSums.attacker[k] = (survivorSums.attacker[k] || 0) + n;
    for (const [k, n] of Object.entries(r.defendersLeft)) survivorSums.defender[k] = (survivorSums.defender[k] || 0) + n;
  }

  const avgLosses = (fleet, side) => {
    const out = {};
    for (const [key, sent] of Object.entries(fleet)) {
      if (!sent) continue;
      const avgSurvived = (survivorSums[side][key] || 0) / opts.sims;
      out[key] = { sent, lost: sent - avgSurvived };
    }
    return out;
  };

  return {
    outcomes,
    avgRounds: totalRounds / opts.sims,
    attackerLosses: avgLosses(attackerFleet, 'attacker'),
    defenderLosses: avgLosses(defenderFleet, 'defender'),
  };
}

// Resource value of average losses; debris = debrisRate × (ore/silicates/alloys only —
// per observed pirate reports, hydrogen never appears in debris).
function lossesToResources(losses) {
  const total = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0 };
  for (const [key, l] of Object.entries(losses)) {
    const def = shipDefs[key];
    if (!def) continue;
    total.ore += l.lost * def.costOre;
    total.silicates += l.lost * def.costSilicates;
    total.hydrogen += l.lost * def.costHydrogen;
    total.alloys += l.lost * def.costAlloys;
  }
  return total;
}

// ── UI ─────────────────────────────────────────────────────────────────────

function fmt(n) {
  return Math.round(n).toLocaleString();
}

const GROUP_ORDER = ['combat', 'special', 'recon', 'utility'];
const GROUP_LABELS = { combat: 'Combat', special: 'Special', recon: 'Recon', utility: 'Utility' };

function buildFleetInputs(tbodyId, side) {
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  const defs = Object.values(shipDefs).sort((a, b) =>
    GROUP_ORDER.indexOf(a.shipClass) - GROUP_ORDER.indexOf(b.shipClass) || a.sortOrder - b.sortOrder);

  let lastGroup = null;
  for (const def of defs) {
    if (def.shipClass !== lastGroup) {
      lastGroup = def.shipClass;
      const tr = document.createElement('tr');
      tr.className = 'ship-group';
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = GROUP_LABELS[def.shipClass] || def.shipClass;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'ship-name';
    tdName.textContent = def.name;

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.dataset.statsSide = side;
    tdStats.dataset.key = def.key;
    tdStats.textContent = statText(def, NO_MODS);

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.value = 0;
    input.dataset.side = side;
    input.dataset.key = def.key;
    const surv = document.createElement('span');
    surv.className = 'survivors';
    surv.dataset.survSide = side;
    surv.dataset.key = def.key;
    tdInput.append(input, surv);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}

function readFleet(side) {
  const fleet = {};
  document.querySelectorAll(`input[data-side="${side}"][data-key]`).forEach(input => {
    const qty = parseInt(input.value, 10);
    if (qty > 0) fleet[input.dataset.key] = qty;
  });
  return fleet;
}

// Stat line for a ship row, with research modifiers applied (same math as the engine).
function statText(def, mods) {
  const attackBonus = (mods.weapon[def.weaponType] || 0) + mods.weaponAll + (mods.ship[def.key] || 0);
  const atk = Math.round(def.attack * (1 + attackBonus));
  const hp = Math.round(def.hp * (1 + mods.hull));
  const sh = Math.round(def.shieldHp * (1 + mods.shield));
  const dr = mods.damageReduction > 0 ? ` · DR ${Math.round(mods.damageReduction * 100)}%` : '';
  return `ATK ${atk} · HP ${hp} · SH ${sh}${dr}` +
    (def.weaponType ? ` · ${def.weaponType}` : '') + ` · ${def.armorType}`;
}

// Refresh the stat line of every ship row on one side after a tech change.
function updateFleetStats(side) {
  const mods = readMods(side);
  document.querySelectorAll(`td.ship-stats[data-stats-side="${side}"]`).forEach(td => {
    const def = shipDefs[td.dataset.key];
    if (!def) return;
    const text = statText(def, mods);
    td.textContent = text;
    // Highlight only ships whose stats actually changed
    td.style.color = text !== statText(def, NO_MODS) ? '#7ee787' : '';
  });
}

function buildTechInputs(containerId, side) {
  const container = document.getElementById(containerId);
  container.textContent = '';
  let lastGroup = null;
  for (const tech of TECHS) {
    if (tech.group !== lastGroup) {
      lastGroup = tech.group;
      const g = document.createElement('div');
      g.className = 'tech-group';
      g.textContent = tech.group;
      container.appendChild(g);
    }
    const label = document.createElement('span');
    label.className = 'tech-label';
    const effectText = e => e.applies === 'ship' ? `+${(e.perLvl * 100).toFixed(0)}% ${e.ship} damage`
      : e.applies === 'weapon' ? `+${(e.perLvl * 100).toFixed(0)}% ${e.weapon} damage`
      : e.applies === 'weapon_all' ? `+${(e.perLvl * 100).toFixed(0)}% all weapon damage`
      : e.applies === 'hull' ? `+${(e.perLvl * 100).toFixed(0)}% ship HP`
      : e.applies === 'shield' ? `+${(e.perLvl * 100).toFixed(0)}% shield HP`
      : `${(e.perLvl * 100).toFixed(0)}% damage reduction`;
    label.title = effectText(tech) + (tech.also ? ` and ${effectText(tech.also)}` : '') + ' per level';
    label.textContent = tech.name;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tech-input';
    input.min = 0;
    input.max = TECH_MAX_LEVEL;
    input.value = 0;
    input.dataset.techSide = side;
    input.dataset.tech = tech.key;
    input.addEventListener('input', () => updateFleetStats(side));

    container.append(label, input);
  }
}

// Research level inputs for one side → mods for the engine.
function readMods(side) {
  const levels = {};
  document.querySelectorAll(`input[data-tech-side="${side}"]`).forEach(input => {
    const lvl = Math.min(TECH_MAX_LEVEL, Math.max(0, parseInt(input.value, 10) || 0));
    levels[input.dataset.tech] = lvl;
  });
  return computeMods(levels);
}

function makeStatCard(label, value, valueClass) {
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

function renderResults(result, opts) {
  document.getElementById('results').style.display = '';

  const pct = n => `${(n / opts.sims * 100).toFixed(1)}%`;
  const o = result.outcomes;
  const outcomeEl = document.getElementById('outcome-stats');
  outcomeEl.textContent = '';
  outcomeEl.append(
    makeStatCard('Attacker wins', pct(o.attacker_won), 'win-attacker'),
    makeStatCard('Defender wins', pct(o.defender_won), 'win-defender'),
    makeStatCard('Defender holds (round cap)', pct(o.defender_held), 'win-defender'),
    makeStatCard('Mutual destruction', pct(o.mutual_destruction), 'win-draw'),
    makeStatCard('Avg rounds', result.avgRounds.toFixed(1), 'missions'),
  );

  renderLossTable('attacker-losses', result.attackerLosses);
  renderLossTable('defender-losses', result.defenderLosses);
  updateSurvivors('attacker', result.attackerLosses);
  updateSurvivors('defender', result.defenderLosses);
  renderCostCards('attacker-cost', result.attackerLosses);
  renderCostCards('defender-cost', result.defenderLosses);

  // Debris from both sides' destroyed ships
  const a = lossesToResources(result.attackerLosses);
  const d = lossesToResources(result.defenderLosses);
  const debrisEl = document.getElementById('debris-stats');
  debrisEl.textContent = '';
  debrisEl.append(
    makeStatCard('Debris ore',       fmt((a.ore + d.ore) * opts.debrisRate),             'ore'),
    makeStatCard('Debris silicates', fmt((a.silicates + d.silicates) * opts.debrisRate), 'silicates'),
    makeStatCard('Debris alloys',    fmt((a.alloys + d.alloys) * opts.debrisRate),       'alloys'),
  );
}

// Show average survivors next to each ship quantity input after a run.
function updateSurvivors(side, losses) {
  document.querySelectorAll(`.survivors[data-surv-side="${side}"]`).forEach(span => {
    const l = losses[span.dataset.key];
    if (!l) {
      span.textContent = '';
      return;
    }
    const alive = l.sent - l.lost;
    span.textContent = `→ ${alive.toFixed(1)} alive`;
    span.style.color = alive >= l.sent * 0.99 ? '#56d364' : alive > 0 ? '#e3b341' : '#ff7b72';
  });
}

function renderLossTable(tbodyId, losses) {
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const [key, l] of Object.entries(losses)) {
    const def = shipDefs[key];
    const tr = document.createElement('tr');
    const survival = l.sent ? ((l.sent - l.lost) / l.sent * 100).toFixed(0) : 0;
    [def ? def.name : key, fmt(l.sent), l.lost.toFixed(1), `${survival}%`].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  if (!Object.keys(losses).length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.color = '#484f58';
    td.textContent = 'No ships';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function renderCostCards(elId, losses) {
  const cost = lossesToResources(losses);
  const el = document.getElementById(elId);
  el.textContent = '';
  el.append(
    makeStatCard('Ore lost',       fmt(cost.ore),       'ore'),
    makeStatCard('Silicates lost', fmt(cost.silicates), 'silicates'),
    makeStatCard('Hydrogen lost',  fmt(cost.hydrogen),  'hydrogen'),
    makeStatCard('Alloys lost',    fmt(cost.alloys),    'alloys'),
  );
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const status = document.getElementById('sim-status');
  const { ships } = await browser.storage.local.get('ships');

  const defs = Object.values(ships || {});
  if (!defs.length || defs.some(d => d.hp === undefined)) {
    status.textContent = 'Ship combat stats missing — open the dashboard and click "Scrape Now" first.';
    status.className = 'error';
    return;
  }

  shipDefs = {};
  for (const def of defs) shipDefs[def.key] = def;

  buildFleetInputs('attacker-ships', 'attacker');
  buildFleetInputs('defender-ships', 'defender');
  buildTechInputs('attacker-techs', 'attacker');
  buildTechInputs('defender-techs', 'defender');
  status.textContent = `${defs.length} ship types loaded.`;
}

document.getElementById('btn-run').addEventListener('click', () => {
  const attackerFleet = readFleet('attacker');
  const defenderFleet = readFleet('defender');
  const status = document.getElementById('sim-status');
  if (!Object.keys(attackerFleet).length || !Object.keys(defenderFleet).length) {
    status.textContent = 'Both fleets need at least one ship.';
    return;
  }
  status.textContent = 'Simulating…';

  const opts = {
    sims: Math.min(10000, Math.max(1, parseInt(document.getElementById('opt-sims').value, 10) || 500)),
    maxRounds: Math.min(20, Math.max(1, parseInt(document.getElementById('opt-rounds').value, 10) || 10)),
    variance: (parseInt(document.getElementById('opt-variance').value, 10) || 0) / 100,
    debrisRate: Math.min(1, Math.max(0, (parseInt(document.getElementById('opt-debris').value, 10) || 0) / 100)),
    shieldRegen: document.getElementById('opt-shield-regen').checked,
    attackerMods: readMods('attacker'),
    defenderMods: readMods('defender'),
  };

  // Let the status paint before the (potentially long) synchronous run
  setTimeout(() => {
    const result = runSimulations(attackerFleet, defenderFleet, opts);
    renderResults(result, opts);
    status.textContent = `Done — ${opts.sims} simulations.`;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  }, 10);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.querySelectorAll('.fleet-table input').forEach(i => { i.value = 0; });
  document.querySelectorAll('.survivors').forEach(s => { s.textContent = ''; });
  document.getElementById('results').style.display = 'none';
});

// ── Load my fleet ──────────────────────────────────────────────────────────

document.getElementById('btn-load-fleet').addEventListener('click', async function () {
  this.disabled = true;
  const status = document.getElementById('sim-status');
  try {
    const res = await browser.runtime.sendMessage({ type: 'GET_FLEET' });
    if (res.error) {
      status.textContent = `Load fleet failed: ${res.error}`;
      return;
    }
    document.querySelectorAll('input[data-side="attacker"][data-key]').forEach(input => {
      input.value = res.fleet[input.dataset.key] || 0;
    });
    const total = Object.values(res.fleet).reduce((s, n) => s + n, 0);
    status.textContent = `Loaded ${total} stationed ships into attacker fleet.`;
  } finally {
    this.disabled = false;
  }
});

// ── Engine validation against recorded raids ───────────────────────────────

const VALIDATE_OPTS = { sims: 200, maxRounds: 10, variance: 0.1, debrisRate: 0.3, shieldRegen: false };

function fleetArrayToMap(arr) {
  const fleet = {};
  for (const i of (arr || [])) {
    if (shipDefs[i.key] && i.quantity > 0) fleet[i.key] = (fleet[i.key] || 0) + i.quantity;
  }
  return fleet;
}

function fleetLabel(arr) {
  return (arr || []).map(i => `${i.quantity}× ${i.key.replace(/_/g, ' ')}`).join(', ');
}

document.getElementById('btn-validate').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = 'Validating…';
  const tbody = document.getElementById('validation-tbody');
  const summary = document.getElementById('validation-summary');

  try {
    const { pirate_recent_reports } = await browser.storage.local.get('pirate_recent_reports');
    const replayable = (pirate_recent_reports || [])
      .filter(r => r.attacker_fleet?.length && r.pirate_fleet?.length)
      .slice(0, 50);

    summary.textContent = '';
    tbody.textContent = '';
    document.getElementById('validation-results').style.display = '';

    if (!replayable.length) {
      summary.appendChild(makeStatCard('Replayable raids',
        '0 — older records lack fleet data; new raids will include it', ''));
      return;
    }

    let outcomeHits = 0;
    let lossErrSum = 0;

    for (const r of replayable) {
      const result = runSimulations(
        fleetArrayToMap(r.attacker_fleet),
        fleetArrayToMap(r.pirate_fleet),
        VALIDATE_OPTS
      );
      const winRate = result.outcomes.attacker_won / VALIDATE_OPTS.sims;
      const predictedWon = winRate >= 0.5;
      const actualWon = r.outcome === 'attacker_won';
      const match = predictedWon === actualWon;
      if (match) outcomeHits++;

      const actualRemoved = (r.ships_lost || 0) + (r.ships_damaged || 0);
      const predictedRemoved = Object.values(result.attackerLosses)
        .reduce((s, l) => s + l.lost, 0);
      lossErrSum += Math.abs(predictedRemoved - actualRemoved);

      const tr = document.createElement('tr');
      const cells = [
        new Date(r.created_at).toLocaleDateString(),
        fleetLabel(r.attacker_fleet),
        fleetLabel(r.pirate_fleet),
        (r.outcome || 'unknown').replace(/_/g, ' '),
        `${(winRate * 100).toFixed(0)}%`,
        String(actualRemoved),
        predictedRemoved.toFixed(1),
        match ? '✓' : '✗',
      ];
      cells.forEach((v, idx) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (idx === 7) td.style.color = match ? '#56d364' : '#ff7b72';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    summary.append(
      makeStatCard('Raids replayed', String(replayable.length), 'missions'),
      makeStatCard('Outcome accuracy', `${(outcomeHits / replayable.length * 100).toFixed(0)}%`,
        outcomeHits === replayable.length ? 'silicates' : ''),
      makeStatCard('Avg loss error (ships)', (lossErrSum / replayable.length).toFixed(2), ''),
    );
  } finally {
    this.disabled = false;
    this.textContent = 'Validate';
  }
});

init();
