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
  bomber:          { defense_turret: 5 }, // exact: "×5 rapid fire vs defense buildings"
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

// Planetary defense estimates — the game hides building combat stats.
// Turret fights as one structure; bombers get their exact ×5 vs it.
const DEFENSE_EST = {
  turretAtkPerLvl: 150,
  turretHpPerLvl: 2500,
  shieldHpPerLvl: 1500,  // shield generator, regenerates every round per the guide
  ewDrPerLvl: 0.03,      // Electronic Warfare: attacker damage reduction
};

function buildDefenseInstance(defense) {
  if (!defense || !(defense.turret > 0)) return null;
  const maxShield = (defense.shieldGen || 0) * DEFENSE_EST.shieldHpPerLvl;
  const attack = defense.turret * DEFENSE_EST.turretAtkPerLvl;
  return {
    key: 'defense_turret',
    hp: defense.turret * DEFENSE_EST.turretHpPerLvl,
    shield: maxShield,
    maxShield,
    attack,
    drMult: 1,
    def: { key: 'defense_turret', weaponType: 'laser', armorType: 'heavy' },
  };
}

function simulateOnce(attackerFleet, defenderFleet, opts) {
  let attackers = buildInstances(attackerFleet, opts.attackerMods);
  let defenders = buildInstances(defenderFleet, opts.defenderMods);
  let rounds = 0;

  const turret = buildDefenseInstance(opts.defense);
  if (turret) defenders.push(turret);
  if (opts.defense?.ew) {
    // EW reduces attacker accuracy — everything on the defending side takes less damage.
    const ewMult = Math.max(0, 1 - opts.defense.ew * DEFENSE_EST.ewDrPerLvl);
    for (const s of defenders) s.drMult *= ewMult;
  }

  while (attackers.length && defenders.length && rounds < opts.maxRounds) {
    rounds++;
    if (opts.shieldRegen) {
      for (const s of attackers) s.shield = s.maxShield;
      for (const s of defenders) s.shield = s.maxShield;
    } else if (turret && turret.hp > 0) {
      turret.shield = turret.maxShield; // planetary shield always regenerates
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


// Allow the engine to run under node for tests. In the browser this file is
// loaded as a plain script before simulator.js, which shares its globals.
function setShipDefs(defs) {
  shipDefs = defs;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WEAPON_VS_ARMOR, SHIELD_BURN, RAPID_FIRE, rapidFireShots,
    TECHS, TECH_MAX_LEVEL, computeMods, NO_MODS,
    DEFENSE_EST, buildDefenseInstance, buildInstances,
    pickTarget, fireVolley, applyPending,
    simulateOnce, runSimulations, lossesToResources, setShipDefs,
  };
}
