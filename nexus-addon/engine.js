// Combat simulator based on https://s0.nexuslegacy.space/guide/combat.html
//
// The guide deliberately hides exact numbers ("the numbers live in the combat
// engine and are subject to balance changes"), so the multiplier tables below
// are estimates: the weapon-vs-armor shape comes straight from the guide's
// matrix, rapid-fire values from ship descriptions where given, otherwise
// guessed conservatively. Debris rate (30% of destroyed ship cost) was
// calibrated against real pirate battle reports.

// Guide matrix: Strong=1.5, Good=1.25, Neutral=1.0, Weak=0.75, Very Strong=2.0
// Armor types (confirmed from Stats.txt, 2026-06-22):
//   shielded — titan
//   heavy    — battleship, dreadnought, missile_cruiser, carrier, bomber
//   medium   — cruiser
//   light    — interceptor, fighter, scout, torpedo_frigate, gas_collector, probes, civs
// Ships missing armorType in the API will have null and take neutral damage (×1.0 vs all weapons).
const WEAPON_VS_ARMOR = {
  kinetic: { light: 1.5,  medium: 1.0,  heavy: 0.75, shielded: 0.75 },
  laser:   { light: 1.0,  medium: 1.0,  heavy: 1.0,  shielded: 1.0  },
  plasma:  { light: 0.75, medium: 1.0,  heavy: 0.75, shielded: 1.5  },
  missile: { light: 1.25, medium: 1.5,  heavy: 1.25, shielded: 0.75 },
  ion:     { light: 0.75, medium: 0.75, heavy: 0.75, shielded: 2.0  },
};

// "Plasma … chews through shield HP faster", "Ion … great at burning down shield HP"
const SHIELD_BURN = { plasma: 1.5, ion: 2.0 };

// Shots per round vs specific targets. ALL values EXACT, read from the in-game
// ship "Rapid Fire → Strong vs" screens (2026-06-16). Ships not listed
// (scout, probe, spy_probe, civilians) have no rapid fire → 1 shot.
const RAPID_FIRE = {
  fighter:         { probe: 5, spy_probe: 5, torpedo_frigate: 4 },
  interceptor:     { scout: 5, probe: 5, spy_probe: 5, fighter: 4 },
  cruiser:         { scout: 5, fighter: 4, interceptor: 2 },
  carrier:         { scout: 5, fighter: 3 },
  battleship:      { interceptor: 5, cruiser: 4, missile_cruiser: 3 },
  missile_cruiser: { fighter: 5, interceptor: 4, bomber: 3 },
  torpedo_frigate: { battleship: 3, dreadnought: 2, titan: 2 },
  bomber:          { missile_defense: 3, laser_defense: 3, railgun_defense: 3, plasma_defense: 3, ion_defense: 3, ew_system: 3 },
  missile_defense: { probe: 5, spy_probe: 5, scout: 4, fighter: 3, interceptor: 2, assault_shuttle: 2 },
  railgun_defense: { cruiser: 4, missile_cruiser: 2, bomber: 2 },
  plasma_defense:  { battleship: 2, carrier: 2, dreadnought: 2, titan: 2 },
  dreadnought:     { cruiser: 5, bomber: 4, battleship: 3, missile_cruiser: 3, fighter: 3, interceptor: 2, carrier: 2 },
  titan:           { scout: 20, fighter: 15, interceptor: 10, cruiser: 8, battleship: 5, missile_cruiser: 5, bomber: 5, carrier: 5, dreadnought: 3 },
};

// Enemy ships carry variant keys (e.g. wormhole_pirate_fighter) but fight as
// their base class, so strip the faction prefix before matching rapid fire —
// otherwise an interceptor's ×5 vs fighters never fires at pirate fighters.
function normalizeShipKey(key) {
  return (key || '').replace(/^(wormhole_)?(pirate_|alien_|rogue_|elite_)?/, '');
}

function rapidFireShots(attackerKey, targetKey) {
  const rf = RAPID_FIRE[normalizeShipKey(attackerKey)];
  if (!rf) return 1;
  return rf[normalizeShipKey(targetKey)] || 1;
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

export let shipDefs = {};   // key → def (from storage, built by background scrape)

// ── Simulation engine ──────────────────────────────────────────────────────

// fleet: { shipKey: quantity } → array of live ship instances.
// mods: output of computeMods (research bonuses).
function buildInstances(fleet, mods, hpMult) {
  const m = mods || NO_MODS;
  const hp_ = hpMult || 1;
  const out = [];
  for (const [key, qty] of Object.entries(fleet)) {
    // Pirate/NPC ships (wormhole_pirate_fighter, …) aren't in the player
    // shipyard, but they're the same class as the like-named player ship —
    // fall back to that base-class def.
    const def = shipDefs[key] || shipDefs[normalizeShipKey(key)];
    if (!def || !qty) continue;
    const attackBonus = (m.weapon[def.weaponType] || 0) + m.weaponAll + (m.ship[key] || 0);
    const maxHp = def.hp * (1 + m.hull) * hp_;
    const maxShield = def.shieldHp * (1 + m.shield) * hp_;
    const attack = def.attack * (1 + attackBonus);
    const drMult = 1 - m.damageReduction;
    for (let i = 0; i < qty; i++) {
      out.push({ key, hp: maxHp, shield: maxShield, maxShield, attack, drMult, def });
    }
  }
  return out;
}

// Effective HP remaining this volley = hull + shield minus damage already
// queued against it. Used so rapid fire spreads onto fresh targets instead
// of overkilling one.
function effectiveHp(t) {
  return t.hp + t.shield - (t.pendingHull || 0);
}

// Targeting: weakest of 2 random candidates, plus a 3rd candidate 50% of the
// time, drawn from targets not already lethally hit this volley. This partial
// focus-fire was calibrated against real battle reports.
function pickTarget(targets) {
  const alive = targets.filter(t => effectiveHp(t) > 0);
  const pool = alive.length ? alive : targets;
  let t = pool[Math.floor(Math.random() * pool.length)];
  const candidates = Math.random() < 0.5 ? 3 : 2;
  for (let c = 1; c < candidates; c++) {
    const cand = pool[Math.floor(Math.random() * pool.length)];
    if (effectiveHp(cand) < effectiveHp(t)) t = cand;
  }
  return t;
}

// One side fires at the other. Hull damage is queued (pendingHull) and applied
// after both sides have fired (simultaneous fire per the guide). Rapid fire
// gives extra shots based on the first target's type; follow-up shots stay
// within the same ship type ONLY when that type is the highest-RF target
// available — otherwise they fall back to the globally weakest so the burst
// isn't wasted on a suboptimal class when a better RF target exists.
function fireVolley(shooters, targets, opts, dmgMult = 1) {
  if (!targets.length) return;
  for (const s of shooters) {
    if (s.hp <= 0) continue;            // destroyed in prior rounds only; this round's hull damage is applied after both volleys (simultaneous fire).
    const atk = s.attack;
    if (!atk || !s.def.weaponType) continue;
    const first = pickTarget(targets);
    const shots = rapidFireShots(s.key, first.key);
    const burn = SHIELD_BURN[s.def.weaponType] || 1.0;

    // Determine whether RF follow-up shots should concentrate on the trigger
    // type. Two conditions must both hold:
    //   1. Trigger type is the best RF target available (shots >= bestRF) —
    //      prevents accidental bursts on suboptimal targets (e.g. interceptor
    //      ×4 vs fighters when scouts ×5 exist) from pinning fire on a harder
    //      class instead of flowing back to the weakest.
    //   2. Trigger type is NOT already the globally weakest — when it already
    //      is weakest, pickTarget naturally concentrates there (with beneficial
    //      leakage to other types), so the explicit filter would only suppress
    //      that useful spread without helping.
    let sameType = null;
    if (shots > 1) {
      const firstNorm = normalizeShipKey(first.key);
      const bestRF = targets.reduce((best, x) => {
        const rf = rapidFireShots(s.key, x.key);
        return rf > best ? rf : best;
      }, 1);
      if (shots >= bestRF) {
        // Check if any alive non-trigger-type ship is weaker than the trigger.
        const firstEHP = effectiveHp(first);
        const isGloballyWeakest = !targets.some(
          x => normalizeShipKey(x.key) !== firstNorm && effectiveHp(x) > 0 && effectiveHp(x) < firstEHP
        );
        if (!isGloballyWeakest) {
          sameType = targets.filter(x => normalizeShipKey(x.key) === firstNorm);
        }
      }
    }

    for (let i = 0; i < shots; i++) {
      let t;
      if (i === 0) {
        t = first;
      } else if (sameType) {
        const aliveInType = sameType.filter(x => effectiveHp(x) > 0);
        t = aliveInType.length ? pickTarget(aliveInType) : pickTarget(targets);
      } else {
        t = pickTarget(targets);
      }
      const mult = (WEAPON_VS_ARMOR[s.def.weaponType] || {})[t.def.armorType] ?? 1.0;
      const variance = 1 + (Math.random() * 2 - 1) * opts.variance;
      let dmg = atk * mult * variance * t.drMult * dmgMult;
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

// HP multiplier per pirate tier, calibrated against live survey-report battles
// (dead space, 2026-06-22). heavy_raider = baseline; marauder = 1.15× HP+shield.
// Pass opts.defenderTier to simulateOnce / runSimulations to activate.
const PIRATE_TIER = {
  marauder: 1.15,
};

// EW ship: logarithmic jam that caps at EW_JAM_CAP at 1000 ships.
// "Fluctuates each round" → uniform [0, 2×base] per-round draw; mean = base.
// ponytail: log(1001) precomputed; adjust cap & curve once real battle data arrives.
const EW_JAM_CAP = 0.30;
const _EW_LN_NORM = Math.log(10001);

function ewJamFraction(n) {
  if (!n) return 0;
  return EW_JAM_CAP * Math.log(n + 1) / _EW_LN_NORM;
}

function _roundJamMult(fleet) {
  const n = fleet.filter(s => s.key === 'electronic_warfare_ship').length;
  if (!n) return 1;
  return 1 - Math.min(EW_JAM_CAP, ewJamFraction(n) * 2 * Math.random());
}

// Per-level stats for planetary defense buildings, from Stats.txt (2026-07-05).
// A defense building is a battery of `units` individual units per level; atk/hp are
// the building TOTAL (split evenly across its units — each unit is a separate combat
// instance with total/units stats). EW has no attack; its ewDrPerLvl applies to
// attacker damage. Index 0 = level 1.
const DEFENSE_BUILDINGS = {
  missile_defense: {
    name: 'Missile Defense', weaponType: 'missile', armorType: 'heavy',
    atk:   [7, 18, 35, 61, 102, 165, 263, 415, 651, 1017, 1565, 2388, 3622, 5473, 8249],
    hp:    [88, 225, 438, 767, 1277, 2068, 3295, 5197, 8145, 12715, 19570, 29853, 45276, 68413, 103117],
    units: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
  },
  laser_defense: {
    name: 'Laser Defense', weaponType: 'laser', armorType: 'heavy',
    atk:   [10, 27, 54, 100, 176, 300, 506, 846, 1406, 2331, 3718, 5798, 8918, 13599, 20620],
    hp:    [173, 459, 931, 1709, 2994, 5115, 8613, 14386, 23912, 39630, 63207, 98573, 151622, 231195, 350555],
    units: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
  },
  railgun_defense: {
    name: 'Railgun Defense', weaponType: 'kinetic', armorType: 'heavy',
    atk:   [14, 39, 81, 155, 281, 497, 870, 1511, 2614, 4512, 7357, 11626, 18029, 27634, 42041],
    hp:    [208, 565, 1180, 2238, 4059, 7190, 12575, 21838, 37770, 65174, 106281, 167940, 260430, 399164, 607265],
    units: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
  },
  plasma_defense: {
    name: 'Plasma Defense', weaponType: 'plasma', armorType: 'heavy',
    atk:   [19, 55, 121, 240, 457, 853, 1572, 2882, 5266, 9604, 16111, 25872, 40513, 62475, 95419],
    hp:    [561, 1582, 3439, 6821, 12976, 24178, 44567, 81674, 149210, 272125, 456497, 733056, 1147894, 1770152, 2703538],
    units: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45],
  },
  ion_defense: {
    name: 'Ion Defense', weaponType: 'ion', armorType: 'heavy',
    atk:   [13, 36, 75, 141, 251, 435, 746, 1267, 2143, 3614, 5820, 9131, 14096, 21544, 32715],
    hp:    [505, 1356, 2783, 5182, 9212, 15984, 27359, 46471, 78580, 132522, 213436, 334807, 516864, 789949, 1199577],
    units: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
  },
  ew_system: {
    name: 'EW System', weaponType: null, armorType: 'heavy',
    atk:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    hp:    [222, 588, 1192, 2189, 3834, 6549, 11028, 18420, 30615, 50739],
    units: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30],
    ewDrPerLvl: 0.03,   // 3% attacker damage reduction per level, max 30%
  },
};

// defense: { missile_defense: lvl, laser_defense: lvl, ... } → array of combat instances.
// Each building fields `units` units at its level; the building's total ATK/HP is split
// evenly across them, so each unit is a separate combat instance with total/units stats.
// EW units have no attack; its DR effect is applied separately in simulateOnce.
function buildDefenseInstances(defense) {
  if (!defense) return [];
  const out = [];
  for (const [key, bld] of Object.entries(DEFENSE_BUILDINGS)) {
    const lvl = defense[key] || 0;
    if (lvl < 1) continue;
    const idx = Math.min(lvl, bld.hp.length) - 1;
    const count = bld.units[idx] || 1;
    const hp = bld.hp[idx] / count;
    const attack = (bld.atk[idx] || 0) / count;
    for (let i = 0; i < count; i++) {
      out.push({
        key,
        hp,
        shield: 0, maxShield: 0,
        attack,
        drMult: 1,
        def: { key, weaponType: bld.weaponType, armorType: bld.armorType },
      });
    }
  }
  return out;
}

function simulateOnce(attackerFleet, defenderFleet, opts) {
  let attackers = buildInstances(attackerFleet, opts.attackerMods);
  const tierMult = PIRATE_TIER[opts.defenderTier] || 1;
  let defenders = buildInstances(defenderFleet, opts.defenderMods, tierMult);
  let rounds = 0;

  defenders.push(...buildDefenseInstances(opts.defense));
  const ewLevel = opts.defense?.ew_system || 0;
  if (ewLevel > 0) {
    // EW reduces attacker accuracy — all defender units take less damage.
    // Effect applied once at battle start based on initial level (static even if EW is destroyed).
    const ewMult = 1 - Math.min(0.30, ewLevel * DEFENSE_BUILDINGS.ew_system.ewDrPerLvl);
    for (const s of defenders) s.drMult *= ewMult;
  }

  // Optional round-by-round trace (for the "sample battle" display).
  const curHp = arr => arr.reduce((m, s) => m + Math.max(0, s.hp) + Math.max(0, s.shield), 0);
  const trace = opts.trace ? [] : null;
  const atk0 = curHp(attackers) || 1, def0 = curHp(defenders) || 1;
  let prevAtk = attackers.length, prevDef = defenders.length;

  while (attackers.length && defenders.length && rounds < opts.maxRounds) {
    rounds++;
    if (opts.shieldRegen) {
      for (const s of attackers) s.shield = s.maxShield;
      for (const s of defenders) s.shield = s.maxShield;
    }
    // EW ships jam the opposing side's targeting; fluctuates per round.
    fireVolley(attackers, defenders, opts, _roundJamMult(defenders));
    fireVolley(defenders, attackers, opts, _roundJamMult(attackers));
    attackers = applyPending(attackers);
    defenders = applyPending(defenders);
    if (trace) {
      trace.push({
        round: rounds,
        attackerShips: attackers.length, defenderShips: defenders.length,
        attackerLost: prevAtk - attackers.length, defenderLost: prevDef - defenders.length,
        attackerHpPct: Math.round(100 * curHp(attackers) / atk0),
        defenderHpPct: Math.round(100 * curHp(defenders) / def0),
      });
      prevAtk = attackers.length; prevDef = defenders.length;
    }
  }

  let outcome;
  if (!attackers.length && !defenders.length) outcome = 'mutual_destruction';
  else if (!defenders.length) outcome = 'attacker_won';
  else if (!attackers.length) outcome = 'defender_won';
  else outcome = 'defender_held'; // round cap reached — defender holds the field

  const count = arr => arr.reduce((m, s) => { m[s.key] = (m[s.key] || 0) + 1; return m; }, {});
  return { outcome, rounds, attackersLeft: count(attackers), defendersLeft: count(defenders), trace };
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
    const def = shipDefs[key] || shipDefs[normalizeShipKey(key)];
    if (!def) continue;
    total.ore += l.lost * def.costOre;
    total.silicates += l.lost * def.costSilicates;
    total.hydrogen += l.lost * def.costHydrogen;
    total.alloys += l.lost * def.costAlloys;
  }
  return total;
}


// Engine ship stats are injected at runtime: by simulator.js in the browser,
// by the test harness under node. shipDefs is a live binding (see export above).
function setShipDefs(defs) {
  shipDefs = defs;
}

export {
  WEAPON_VS_ARMOR, SHIELD_BURN, RAPID_FIRE, rapidFireShots, normalizeShipKey,
  TECHS, TECH_MAX_LEVEL, computeMods, NO_MODS, PIRATE_TIER,
  EW_JAM_CAP, ewJamFraction,
  DEFENSE_BUILDINGS, buildDefenseInstances, buildInstances,
  pickTarget, fireVolley, applyPending,
  simulateOnce, runSimulations, lossesToResources, setShipDefs,
};
