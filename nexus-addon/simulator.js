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
// stated) and the guide's hard-counter list (estimated values marked ~).
const RAPID_FIRE = {
  interceptor:     { fighter: 5, probe: 5, spy_probe: 5, scout: 5 },
  cruiser:         { fighter: 5, scout: 5, interceptor: 5 },           // desc: ×5 fighters; guide: hunts scouts+interceptors too
  torpedo_frigate: { battleship: 3, dreadnought: 2, titan: 2 },
  battleship:      { cruiser: 4, missile_cruiser: 4 },
  missile_cruiser: { fighter: 5, interceptor: 4, bomber: 3 },
  dreadnought:     { battleship: 4, cruiser: 4, bomber: 4, fighter: 4, carrier: 4 }, // ~4, guide: "crushes the large-ship class"
  titan:           '*4', // guide: "rapid fire against almost everything" — ~4 vs all
};

function rapidFireShots(attackerKey, targetKey) {
  const rf = RAPID_FIRE[attackerKey];
  if (!rf) return 1;
  if (rf === '*4') return 4;
  return rf[targetKey] || 1;
}

let shipDefs = {};   // key → def (from storage, built by background scrape)

// ── Simulation engine ──────────────────────────────────────────────────────

// fleet: { shipKey: quantity } → array of live ship instances
function buildInstances(fleet) {
  const out = [];
  for (const [key, qty] of Object.entries(fleet)) {
    const def = shipDefs[key];
    if (!def || !qty) continue;
    for (let i = 0; i < qty; i++) {
      out.push({ key, hp: def.hp, shield: def.shieldHp, def });
    }
  }
  return out;
}

// One side fires at the other. Targets are picked from the alive-at-round-start
// snapshot; hull damage lands immediately but deaths are culled after both
// sides have fired (simultaneous fire per the guide).
function fireVolley(shooters, targets, opts) {
  if (!targets.length) return;
  for (const s of shooters) {
    if (s.hp <= 0) continue;            // killed earlier this round still fires? No — guide: simultaneous.
    const atk = s.def.attack;
    if (!atk || !s.def.weaponType) continue;
    const t = targets[Math.floor(Math.random() * targets.length)];
    const shots = rapidFireShots(s.key, t.key);
    const mult = (WEAPON_VS_ARMOR[s.def.weaponType] || {})[t.def.armorType] ?? 1.0;
    const burn = SHIELD_BURN[s.def.weaponType] || 1.0;
    for (let i = 0; i < shots; i++) {
      const variance = 1 + (Math.random() * 2 - 1) * opts.variance;
      let dmg = atk * mult * variance;
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
  let attackers = buildInstances(attackerFleet);
  let defenders = buildInstances(defenderFleet);
  let rounds = 0;

  while (attackers.length && defenders.length && rounds < opts.maxRounds) {
    rounds++;
    if (opts.shieldRegen) {
      for (const s of attackers) s.shield = s.def.shieldHp;
      for (const s of defenders) s.shield = s.def.shieldHp;
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
    tdStats.textContent = `ATK ${def.attack} · HP ${def.hp} · SH ${def.shieldHp}` +
      (def.weaponType ? ` · ${def.weaponType}` : '') + ` · ${def.armorType}`;

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.value = 0;
    input.dataset.side = side;
    input.dataset.key = def.key;
    tdInput.appendChild(input);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}

function readFleet(side) {
  const fleet = {};
  document.querySelectorAll(`input[data-side="${side}"]`).forEach(input => {
    const qty = parseInt(input.value, 10);
    if (qty > 0) fleet[input.dataset.key] = qty;
  });
  return fleet;
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
  if (!defs.length || defs[0].hp === undefined) {
    status.textContent = 'Ship combat stats missing — open the dashboard and click "Scrape Now" first.';
    status.className = 'error';
    return;
  }

  shipDefs = {};
  for (const def of defs) shipDefs[def.key] = def;

  buildFleetInputs('attacker-ships', 'attacker');
  buildFleetInputs('defender-ships', 'defender');
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
    sims: Math.max(1, parseInt(document.getElementById('opt-sims').value, 10) || 500),
    maxRounds: Math.max(1, parseInt(document.getElementById('opt-rounds').value, 10) || 6),
    variance: (parseInt(document.getElementById('opt-variance').value, 10) || 0) / 100,
    debrisRate: (parseInt(document.getElementById('opt-debris').value, 10) || 0) / 100,
    shieldRegen: document.getElementById('opt-shield-regen').checked,
  };

  // Let the status paint before the (potentially long) synchronous run
  setTimeout(() => {
    const result = runSimulations(attackerFleet, defenderFleet, opts);
    renderResults(result, opts);
    status.textContent = `Done — ${opts.sims} simulations.`;
  }, 10);
});

document.getElementById('btn-clear').addEventListener('click', () => {
  document.querySelectorAll('.fleet-table input').forEach(i => { i.value = 0; });
  document.getElementById('results').style.display = 'none';
});

init();
