// Tech Tree tab — research from /api/research, laid out as a dependency graph.

import { fmt, store, confirmDialog, escapeHtml } from '../common.js';
import { loadAll } from '../dashboard.js';

export const BRANCH_ORDER = ['military', 'science', 'economy'];
export const BRANCH_COLORS = { military: '#ff7b72', science: '#58a6ff', economy: '#e3b341' };
export const STATUS_LEGEND = [
  ['maxed', '#56d364', 'Maxed'], ['researched', '#58a6ff', 'Researched'],
  ['researching', '#e3b341', 'Researching'], ['available', '#8b949e', 'Available'],
  ['locked', '#484f58', 'Locked'],
];
export const SVGNS = 'http://www.w3.org/2000/svg';
export let ttPinned = null;   // pinned tech key (click to lock highlight)
export let ttDragged = false;  // a pan just happened — suppress the trailing click
export let ttZoom = 1;        // wheel zoom factor
export let ttCanvas = null, ttCanvasW = 0, ttCanvasH = 0;   // last rendered canvas + dims
export let ttTargets = [];    // [{key, level}] — techs the user wants, at a target level
export let ttResearch = [];   // last rendered research array (for the queue planner)
export let ttLevelsRef = {};  // key → current level
export let ttTargetsLoaded = false;
export let ttResources = null;   // { ore, silicates, …, oreRate, … } or { error }

// ── Research queue planner ──────────────────────────────────────────────────
export function techByKey(key) { return ttResearch.find(t => t.key === key); }

export function saveTargets() { browser.storage.local.set({ tt_queue_targets: ttTargets }); }

export async function loadTargets() {
  const { tt_queue_targets } = await browser.storage.local.get('tt_queue_targets');
  ttTargets = Array.isArray(tt_queue_targets) ? tt_queue_targets : [];
  ttTargetsLoaded = true;
  renderQueue();
  updateQueueBadges();
}

export async function fetchResources() {
  const res = await browser.runtime.sendMessage({ type: 'GET_RESOURCES' });
  ttResources = res;
  renderQueue();
}

// Estimated lab level = highest required-lab-level among techs already at L≥1
// (you couldn't have researched them otherwise).
export function estLabLevel() {
  let lab = 0;
  for (const t of ttResearch) {
    if ((ttLevelsRef[t.key] || 0) > 0 && (t.requiredLabLevel || 0) > lab) lab = t.requiredLabLevel;
  }
  return lab;
}

// Real lab level (highest Research Lab across planets, from the API) when
// available; otherwise the estimate above. estimated=true marks the fallback.
export function currentLabLevel() {
  const R = ttResources;
  if (R && !R.error && R.labLevel != null) return { level: R.labLevel, estimated: false };
  return { level: estLabLevel(), estimated: true };
}

// Queue a tech up to its max level.
export function maxToQueue(key) {
  const t = techByKey(key);
  if (!t) return;
  const max = t.maxLevel || 1;
  if (max <= (ttLevelsRef[key] || 0)) return;
  const ex = ttTargets.find(x => x.key === key);
  if (ex) ex.level = max; else ttTargets.push({ key, level: max });
  renderQueue(); updateQueueBadges(); saveTargets();
}

// Cost / time for a single level L of a tech (1-indexed): base × factor^(L-1).
export function costAt(t, field, L) { return Math.round((t[field] || 0) * Math.pow(t.costFactor || 1, L - 1)); }
export function rareAt(t, L) {
  const o = {};
  for (const [k, v] of Object.entries(t.rareCosts || {})) o[k] = Math.round(v * Math.pow(t.costFactor || 1, L - 1));
  return o;
}
// Planet-independent base seconds to research level L (absolute, 1-indexed).
// The game's own per-level time is `nextResearchTime` for the immediate next
// level (the `researchTime × timeFactor^(L-1)` formula does NOT match it); we
// extrapolate deeper levels by timeFactor. The actual time on a given planet is
// this × that planet's researchSpeedMult, applied by the scheduler per slot.
export function baseTimeAt(t, L) {
  const cur = t.level || 0;
  const nextT = (t.nextResearchTime || 0) || (t.researchTime || 0) * Math.pow(t.timeFactor || 1, Math.max(0, cur));
  return nextT * Math.pow(t.timeFactor || 1, Math.max(0, L - cur - 1));
}

// Per-planet research speed mults (one slot each). Falls back to a single slot
// at the global mult when per-planet data isn't loaded.
export function planetSpeeds() {
  const s = ttResources && !ttResources.error ? ttResources.planetSpeeds : null;
  if (Array.isArray(s) && s.length) return s.slice();
  return [store.research_speed_mult || 1];
}

// Planets with an idle research slot (not currently researching), fastest first.
export function freeResearchPlanets() {
  const all = (ttResources && !ttResources.error && ttResources.researchPlanets) || [];
  const busy = new Set((store.active_research || []).map(a => a.planetId).filter(x => x != null));
  return all.filter(p => !busy.has(p.id)).sort((a, b) => a.mult - b.mult);
}

// A step can be launched right now: it's the tech's immediate next level, the
// lab requirement is met, and every research prerequisite is already owned.
export function isLaunchable(t, level) {
  if (!t || level !== (t.level || 0) + 1) return false;
  if ((t.requiredLabLevel || 0) > currentLabLevel().level) return false;
  return (t.requirements || []).every(r =>
    r.type !== 'research' || (ttLevelsRef[r.key] || 0) >= (r.level || 1));
}

// Fill the "Launch on" planet picker: all planets, busy ones disabled, the
// previous choice kept when still free else the fastest free planet selected.
export function populatePlanetSelect() {
  const wrap = document.getElementById('tt-launch-planet');
  const sel = document.getElementById('tt-planet-select');
  if (!wrap || !sel) return;
  const all = (ttResources && !ttResources.error && ttResources.researchPlanets) || [];
  if (!all.length) { wrap.style.display = 'none'; return; }
  const busy = new Set((store.active_research || []).map(a => a.planetId).filter(x => x != null));
  const prev = sel.value;
  sel.textContent = '';
  for (const p of all) {
    const o = document.createElement('option');
    o.value = String(p.id);
    o.disabled = busy.has(p.id);
    o.textContent = busy.has(p.id) ? `${p.name} (busy)` : p.name;
    sel.appendChild(o);
  }
  const free = all.filter(p => !busy.has(p.id));
  const keep = free.some(p => String(p.id) === prev);
  sel.value = keep ? prev : (free[0] ? String(free[0].id) : '');
  wrap.style.display = '';
}

// Which planet a launch will run on, or null if none is free. Research isn't
// tied to any planet — any planet with an idle lab slot can run any tech — so
// use the dropdown choice, else the fastest free one.
export function launchPlanetFor() {
  const free = freeResearchPlanets();
  if (!free.length) return null;
  const sel = document.getElementById('tt-planet-select');
  const chosen = sel && sel.value ? Number(sel.value) : null;
  return free.find(p => p.id === chosen) || free[0];
}

// Launch the immediate next level of a tech, after an explicit confirm. Real,
// resource-spending action (cancel refunds only 90%).
export async function launchResearch(t, level) {
  const planet = launchPlanetFor();
  if (!planet) { alert('No free research slot — every planet is already researching.'); return; }
  const eta = fmtDuration(baseTimeAt(t, level) * planet.mult);
  const cost = `${fmt(costAt(t, 'costOre', level))} ore · ${fmt(costAt(t, 'costSilicates', level))} sil · ${fmt(costAt(t, 'costHydrogen', level))} hyd`;
  if (!await confirmDialog(`Start ${t.name} L${level} on ${planet.name}?\n\nCost: ${cost}\nTime: ${eta}`)) return;
  const res = await browser.runtime.sendMessage({
    type: 'START_RESEARCH', researchId: t.id, planetId: planet.id,
  });
  if (res && res.error) { alert(res.error); return; }
  ttResources = null;        // force a fresh resource/slot fetch
  await loadAll();           // reload store + re-render (background already re-scraped)
}

// ── Lab building cost/time ───────────────────────────────────────────────────
// The game doesn't expose per-level building costs, so we derive them from the
// research_lab definition. ASSUMPTION (retune if numbers drift from in-game):
//   cost(L)  = baseCost × Π factor(l), l=2..L, factor(l)= l<=costDoubleAfter
//              ? costFactor : highLevelFactor
//   time(L)  = baseBuildTime × buildTimeFactor^(L-1) / buildSpeedMult (seconds)
export function buildCostAt(def, field, L) {
  const base = def?.[`baseCost${field}`] || 0;
  if (!base) return 0;
  const cf = def.costFactor || 1, hf = def.highLevelFactor || cf;
  const cd = def.costDoubleAfter ?? Infinity;
  let mult = 1;
  for (let l = 2; l <= L; l++) mult *= (l <= cd ? cf : hf);
  return Math.round(base * mult);
}
export function buildTimeAt(def, L, buildSpeedMult) {
  const t = (def?.baseBuildTime || 0) * Math.pow(def?.buildTimeFactor || 1, L - 1);
  return buildSpeedMult ? t / buildSpeedMult : t;
}

// Lab-upgrade steps needed so every planned tech meets its requiredLabLevel.
// Empty when the lab definition isn't loaded yet.
export function labStepsNeeded(researchSteps) {
  const def = ttResources && !ttResources.error ? ttResources.labDef : null;
  if (!def) return [];
  const cur = currentLabLevel().level;
  let need = cur;
  for (const s of researchSteps) {
    const t = techByKey(s.key);
    if (t && (t.requiredLabLevel || 0) > need) need = t.requiredLabLevel;
  }
  need = Math.min(need, def.maxLevel || need);
  const out = [];
  for (let L = cur + 1; L <= need; L++) out.push({ kind: 'lab', level: L });
  return out;
}

// ── Schedule ─────────────────────────────────────────────────────────────────
// Lay the plan onto a real timeline: research runs on P parallel slots (P =
// number of planets), lab upgrades run sequentially on the lab planet's build
// queue, and every step waits for its prerequisites (prereq techs, the prior
// level of the same tech, and the lab reaching its required level) to finish.
// Returns items with start/finish/cost, the overall finish time, and slot count.
export function computeSchedule() {
  const research = buildPlan();
  const labSteps = labStepsNeeded(research);
  const def = ttResources && !ttResources.error ? ttResources.labDef : null;
  const bsm = (ttResources && ttResources.buildSpeedMult) || 1;
  const curLab = currentLabLevel().level;
  const now = Date.now();

  // One parallel research slot per planet, each with its own speed mult.
  // Pre-load slots with any research already in progress.
  const speeds = planetSpeeds();
  const P = speeds.length;
  const slots = speeds.map(mult => ({ free: now, mult }));
  const minSlot = () => { let mi = 0; for (let i = 1; i < slots.length; i++) if (slots[i].free < slots[mi].free) mi = i; return mi; };
  for (const a of (store.active_research || [])) {
    const e = Date.parse(a.endsAt);
    if (!isNaN(e)) { const mi = minSlot(); slots[mi].free = Math.max(slots[mi].free, e); }
  }

  // Lab build queue: single sequential timeline, after any in-flight upgrade.
  let labFree = now;
  if (ttResources && ttResources.labUpgradeEndsAt) {
    const e = Date.parse(ttResources.labUpgradeEndsAt);
    if (!isNaN(e)) labFree = Math.max(labFree, e);
  }

  const finishAt = {};   // `lab@L` | `key@L` → finish ms
  const items = [];

  for (const ls of labSteps) {
    const durMs = buildTimeAt(def, ls.level, bsm) * 1000;
    const start = labFree;
    const finish = start + durMs;
    labFree = finish;
    finishAt[`lab@${ls.level}`] = finish;
    items.push({
      kind: 'lab', level: ls.level, start, finish, durMs,
      cost: {
        ore: buildCostAt(def, 'Ore', ls.level), silicates: buildCostAt(def, 'Silicates', ls.level),
        hydrogen: buildCostAt(def, 'Hydrogen', ls.level), alloys: buildCostAt(def, 'Alloys', ls.level),
      },
      rare: {},
    });
  }

  for (const s of research) {
    const t = techByKey(s.key);
    let ready = now;
    const cur = ttLevelsRef[s.key] || 0;
    if (s.level - 1 > cur && finishAt[`${s.key}@${s.level - 1}`]) ready = Math.max(ready, finishAt[`${s.key}@${s.level - 1}`]);
    for (const r of (t.requirements || [])) {
      if (r.type !== 'research') continue;
      const rl = r.level || 1;
      if (rl > (ttLevelsRef[r.key] || 0) && finishAt[`${r.key}@${rl}`]) ready = Math.max(ready, finishAt[`${r.key}@${rl}`]);
    }
    const needLab = t.requiredLabLevel || 0;
    if (needLab > curLab && finishAt[`lab@${needLab}`]) ready = Math.max(ready, finishAt[`lab@${needLab}`]);

    const mi = minSlot();
    const durMs = baseTimeAt(t, s.level) * slots[mi].mult * 1000;   // planet-specific speed
    const start = Math.max(ready, slots[mi].free);
    const finish = start + durMs;
    slots[mi].free = finish;
    finishAt[`${s.key}@${s.level}`] = finish;
    items.push({
      kind: 'research', key: s.key, level: s.level, isTarget: s.isTarget, start, finish, durMs,
      cost: {
        ore: costAt(t, 'costOre', s.level), silicates: costAt(t, 'costSilicates', s.level),
        hydrogen: costAt(t, 'costHydrogen', s.level), alloys: costAt(t, 'costAlloys', s.level),
      },
      rare: rareAt(t, s.level),
    });
  }

  items.sort((a, b) => a.start - b.start || a.finish - b.finish);
  const finishTime = items.reduce((m, i) => Math.max(m, i.finish), now);
  return { items, labCount: labSteps.length, finishTime, slots: P, now };
}

// Expand the targets into ordered per-level steps: every prerequisite is
// brought up to its required level (recursively) before the tech, and a tech
// targeted above its current level is expanded into one step per level.
export function buildPlan() {
  const planned = {}, steps = [], visiting = new Set();
  const targetKeys = new Set(ttTargets.map(x => x.key));
  function need(key, level) {
    const t = techByKey(key);
    if (!t) return;
    level = Math.min(level, t.maxLevel || 1);
    const cur = ttLevelsRef[key] || 0;
    if (level <= cur || (planned[key] || cur) >= level || visiting.has(key)) return;
    visiting.add(key);
    for (const req of (t.requirements || [])) {
      if (req.type === 'research') need(req.key, req.level || 1);
    }
    visiting.delete(key);
    const from = planned[key] || cur;
    for (let L = from + 1; L <= level; L++) steps.push({ key, level: L, isTarget: targetKeys.has(key) });
    planned[key] = level;
  }
  for (const tg of ttTargets) need(tg.key, tg.level);
  return steps;
}

export function addToQueue(key) {
  const t = techByKey(key);
  if (!t) return;
  const ex = ttTargets.find(x => x.key === key);
  const base = ex ? ex.level : (ttLevelsRef[key] || 0);
  const next = Math.min(base + 1, t.maxLevel || 1);
  if (next <= (ttLevelsRef[key] || 0)) return;   // already maxed
  if (ex) ex.level = next; else ttTargets.push({ key, level: next });
  renderQueue();
  updateQueueBadges();
  saveTargets();
}

// Does this single target's plan include `key` at `level` or higher?
export function targetNeeds(tg, key, level) {
  const planned = {}, visiting = new Set();
  let hit = false;
  (function need(k, l) {
    const t = techByKey(k);
    if (!t) return;
    l = Math.min(l, t.maxLevel || 1);
    const cur = ttLevelsRef[k] || 0;
    if (l <= cur || (planned[k] || cur) >= l || visiting.has(k)) return;
    visiting.add(k);
    for (const r of (t.requirements || [])) if (r.type === 'research') need(r.key, r.level || 1);
    visiting.delete(k);
    if (k === key && l >= level) hit = true;
    planned[k] = l;
  })(tg.key, tg.level);
  return hit;
}

// Remove one planned level. For a target step, trim the target to level-1 so
// the lower levels stay. For a dependency step, drop the targets that pulled it
// in at this level or above.
// Add every dependency in a target's plan as its own target, so the deps
// survive when the tech that pulled them in is removed.
export function promoteDeps(targetKey, targetLevel) {
  const planned = {}, visiting = new Set(), deps = {};
  (function need(k, l) {
    const t = techByKey(k);
    if (!t) return;
    l = Math.min(l, t.maxLevel || 1);
    const cur = ttLevelsRef[k] || 0;
    if (l <= cur || (planned[k] || cur) >= l || visiting.has(k)) return;
    visiting.add(k);
    for (const r of (t.requirements || [])) if (r.type === 'research') need(r.key, r.level || 1);
    visiting.delete(k);
    if (k !== targetKey) deps[k] = l;
    planned[k] = l;
  })(targetKey, targetLevel);
  for (const [k, l] of Object.entries(deps)) {
    const ex = ttTargets.find(x => x.key === k);
    if (ex) ex.level = Math.max(ex.level, l); else ttTargets.push({ key: k, level: l });
  }
}

export function removeStep(key, level) {
  const tgt = ttTargets.find(t => t.key === key);
  const cur = ttLevelsRef[key] || 0;
  if (tgt && level <= tgt.level && level > cur) {
    if (level - 1 <= cur) {
      promoteDeps(key, tgt.level);   // keep the dependencies after removing the tech
      ttTargets = ttTargets.filter(t => t !== tgt);
    } else {
      tgt.level = level - 1;
    }
  } else {
    ttTargets = ttTargets.filter(t => !targetNeeds(t, key, level));
  }
  renderQueue();
  updateQueueBadges();
  saveTargets();
}

export function updateQueueBadges() {
  const inPlan = new Set(buildPlan().map(s => s.key));
  document.querySelectorAll('#techtree .tt-add').forEach(el =>
    el.classList.toggle('queued', inPlan.has(el.dataset.key)));
}

export function fmtDuration(sec) {
  sec = Math.round(sec);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600);
  const m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, (s || (!d && !h && !m)) && `${s}s`]
    .filter(Boolean).join(' ');
}

export function fmtClock(ms) {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Time-aware affordability: walk the scheduled steps in start order, accruing
// income up to each step's start, and find the largest per-resource shortfall.
// Returns null when there's no resource data, else { ok, waitH, infeasible }.
export function scheduleAffordability(items, now) {
  const R = ttResources;
  if (!R || R.error) return null;
  const fields = [['ore', 'oreRate'], ['silicates', 'silicatesRate'], ['hydrogen', 'hydrogenRate'], ['alloys', 'alloysRate']];
  const cum = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0 };
  let waitH = 0, short = false, infeasible = false;
  for (const it of items) {
    const hrs = (it.start - now) / 3600000;
    for (const [k, rateK] of fields) {
      cum[k] += it.cost[k] || 0;
      const avail = (R[k] || 0) + (R[rateK] || 0) * hrs;
      if (cum[k] > avail) {
        short = true;
        const rate = R[rateK] || 0;
        if (rate <= 0) infeasible = true;
        else waitH = Math.max(waitH, (cum[k] - avail) / rate);
      }
    }
  }
  return { ok: !short, waitH, infeasible };
}

export function renderQueue() {
  const list = document.getElementById('tt-queue-list');
  const totalsEl = document.getElementById('tt-queue-totals');
  const clearBtn = document.getElementById('tt-queue-clear');
  if (!list) return;
  const { items, finishTime, slots, now } = computeSchedule();
  list.textContent = '';
  if (!items.length) {
    list.className = 'tt-queue-empty';
    list.innerHTML = 'Click <b>+</b> on a tech to plan it.';
    totalsEl.textContent = '';
    clearBtn.style.display = 'none';
    const wrap = document.getElementById('tt-launch-planet');
    if (wrap) wrap.style.display = 'none';
    return;
  }
  list.className = '';
  populatePlanetSelect();
  const labInfo = currentLabLevel();
  const cost = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0 };
  const rare = {};
  let researchTime = 0;

  items.forEach((it, i) => {
    for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) cost[k] += it.cost[k] || 0;
    for (const [k, v] of Object.entries(it.rare || {})) rare[k] = (rare[k] || 0) + v;

    const row = document.createElement('div');
    const done = `done ${fmtClock(it.finish)}`;
    if (it.kind === 'lab') {
      row.className = 'tt-queue-item lab';
      row.innerHTML = `<span class="seq">${i + 1}</span>` +
        `<span class="nm">🔬 Research Lab L${it.level}<br><span class="eta">${done}</span></span>`;
    } else {
      researchTime += it.durMs / 1000;
      const t = techByKey(it.key);
      const needsLab = (t.requiredLabLevel || 0) > labInfo.level;
      // Only flag a still-unmet lab when no lab upgrade is planned to cover it.
      const labCovered = items.some(x => x.kind === 'lab' && x.level >= (t.requiredLabLevel || 0));
      const labTag = needsLab && !labCovered
        ? ` <span class="tt-lab" title="needs lab L${t.requiredLabLevel}">🔒L${t.requiredLabLevel}</span>` : '';
      row.className = 'tt-queue-item' + (it.isTarget ? '' : ' dep');
      row.innerHTML = `<span class="seq">${i + 1}</span>` +
        `<span class="nm">${escapeHtml(t.name)} L${it.level}${labTag}<br><span class="eta">${done}</span></span>`;
      if (isLaunchable(t, it.level)) {
        const go = document.createElement('button');
        go.className = 'go'; go.textContent = '▶';
        const planet = launchPlanetFor();
        go.disabled = !planet;
        go.title = planet ? `Start on ${planet.name}` : 'No free research slot — every planet is researching';
        go.addEventListener('click', () => launchResearch(t, it.level));
        row.appendChild(go);
      }
      const rm = document.createElement('button');
      rm.className = 'rm'; rm.textContent = '✕'; rm.title = 'Remove';
      rm.addEventListener('click', () => removeStep(it.key, it.level));
      row.appendChild(rm);
    }
    list.appendChild(row);
  });

  const parts = [`${fmt(cost.ore)} ore`, `${fmt(cost.silicates)} sil`, `${fmt(cost.hydrogen)} hyd`];
  if (cost.alloys) parts.push(`${fmt(cost.alloys)} alloys`);
  for (const [k, v] of Object.entries(rare)) if (v) parts.push(`${fmt(v)} ${k.replace(/_/g, ' ')}`);

  const aff = scheduleAffordability(items, now);
  let afford = '';
  if (aff) {
    afford = aff.ok ? '<div style="color:#56d364">Affordable now</div>'
      : aff.infeasible ? '<div style="color:#ff7b72">Not affordable (no income for a resource)</div>'
        : `<div style="color:#e3b341">Affordable in ~${fmtDuration(aff.waitH * 3600)} (at current rates)</div>`;
  }

  const slotNote = slots > 1 ? ` · ${slots} research slots` : '';
  totalsEl.innerHTML =
    `<div>Cost: <span class="tot-val">${parts.join(' · ')}</span></div>` +
    afford +
    `<div>Research time: <span class="tot-val">${fmtDuration(researchTime)}</span> · ${items.length} steps${slotNote}</div>` +
    `<div>Queue done: <span class="tot-val">${fmtClock(finishTime)}</span></div>` +
    (labInfo.level ? `<div style="color:#6e7681">${labInfo.estimated ? 'Est. lab' : 'Lab'} level ${labInfo.level}</div>` : '');
  clearBtn.style.display = '';
}

// Build an orthogonal path through anchor points with rounded corners.
export function roundedOrthoPath(pts, R) {
  const O = [[pts[0][0], pts[0][1]]];
  let px = pts[0][0], py = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const my = (py + yi) / 2;
    O.push([px, my], [xi, my], [xi, yi]);
    px = xi; py = yi;
  }
  const V = O.filter((p, i) => i === 0 || p[0] !== O[i - 1][0] || p[1] !== O[i - 1][1]);
  if (V.length < 2) return `M${V[0][0]},${V[0][1]}`;
  let d = `M${V[0][0]},${V[0][1]}`;
  for (let i = 1; i < V.length - 1; i++) {
    const a = V[i - 1], b = V[i], c = V[i + 1];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const r1 = Math.min(R, la / 2), r2 = Math.min(R, lc / 2);
    const p1 = [b[0] + (a[0] - b[0]) / la * r1, b[1] + (a[1] - b[1]) / la * r1];
    const p2 = [b[0] + (c[0] - b[0]) / lc * r2, b[1] + (c[1] - b[1]) / lc * r2];
    d += ` L${p1[0]},${p1[1]} Q${b[0]},${b[1]} ${p2[0]},${p2[1]}`;
  }
  const last = V[V.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}

// Apply the current zoom to the canvas. transform scales visually; the margin
// extends/contracts the scroll area so the viewport scrolls to the scaled box.
export function applyZoom() {
  if (!ttCanvas) return;
  ttCanvas.style.transformOrigin = '0 0';
  ttCanvas.style.transform = `scale(${ttZoom})`;
  ttCanvas.style.marginRight = `${(ttZoom - 1) * ttCanvasW}px`;
  ttCanvas.style.marginBottom = `${(ttZoom - 1) * ttCanvasH}px`;
}

// Status of a tech given the level map (key → level) for requirement checks.
export function techStatus(t, levels) {
  if (t.isMaxed || (t.maxLevel && t.level >= t.maxLevel)) return 'maxed';
  if (t.status === 'researching' || t.status === 'in_progress' || t.status === 'active') return 'researching';
  if (t.level > 0) return 'researched';
  const reqsMet = (t.requirements || []).every(req =>
    req.type !== 'research' || (levels[req.key] || 0) > 0);
  if (t.eraUnlocked && reqsMet) return 'available';
  return 'locked';
}

export function techTooltip(t, levels) {
  const lines = [t.description || ''];
  if (t.requirements?.length) {
    lines.push('Requires: ' + t.requirements.map(r => {
      const met = r.type !== 'research' || (levels[r.key] || 0) > 0;
      return `${r.key.replace(/_/g, ' ')}${met ? ' ✓' : ' ✗'}`;
    }).join(', '));
  }
  if (t.requiredLabLevel) lines.push(`Lab level ${t.requiredLabLevel}`);
  if (!t.isMaxed) {
    const cost = [
      t.nextCostOre && `${fmt(t.nextCostOre)} ore`,
      t.nextCostSilicates && `${fmt(t.nextCostSilicates)} sil`,
      t.nextCostHydrogen && `${fmt(t.nextCostHydrogen)} hyd`,
      t.nextCostAlloys && `${fmt(t.nextCostAlloys)} alloys`,
    ].filter(Boolean).join(', ');
    if (cost) lines.push(`Next level: ${cost}`);
  }
  return lines.filter(Boolean).join('\n');
}

export function populateBranchOptions(research) {
  const sel = document.getElementById('tt-branch');
  if (!sel) return;
  const branches = [...new Set(research.map(t => t.branch).filter(Boolean))];
  branches.sort((a, b) => BRANCH_ORDER.indexOf(a) - BRANCH_ORDER.indexOf(b));
  const current = sel.value;
  sel.textContent = '';
  const all = document.createElement('option');
  all.value = 'all'; all.textContent = 'All branches';
  sel.appendChild(all);
  for (const b of branches) {
    const o = document.createElement('option');
    o.value = b; o.textContent = b[0].toUpperCase() + b.slice(1);
    sel.appendChild(o);
  }
  sel.value = branches.includes(current) || current === 'all' ? current : 'all';
}

// Dependency depth = longest chain of research prerequisites. Drives columns.
export function computeDepths(research) {
  const byKey = {};
  for (const t of research) byKey[t.key] = t;
  // Lab-level floor: map each distinct required lab level to a compact rank so
  // higher-lab techs never sit above lower-lab ones (tiebreak when the
  // prerequisite chain alone doesn't already push them deeper).
  const labLevels = [...new Set(research.map(t => t.requiredLabLevel || 0))].sort((a, b) => a - b);
  const labFloor = {};
  labLevels.forEach((lv, i) => { labFloor[lv] = i; });
  const depth = {};
  const visit = (key, seen) => {
    if (key in depth) return depth[key];
    const t = byKey[key];
    if (!t || seen.has(key)) return 0;
    seen.add(key);
    const reqs = (t.requirements || []).filter(r => r.type === 'research' && byKey[r.key]);
    const prereqD = reqs.length ? 1 + Math.max(...reqs.map(r => visit(r.key, seen))) : 0;
    seen.delete(key);
    depth[key] = Math.max(prereqD, labFloor[t.requiredLabLevel || 0]);
    return depth[key];
  };
  for (const t of research) visit(t.key, new Set());
  return depth;
}

export const NODE_W = 165, NODE_H = 60, GAP_X = 40, GAP_Y = 120, PAD = 10;

export function renderTechTreeTab() {
  const research = store.research || [];
  populateBranchOptions(research);

  const container = document.getElementById('techtree');
  container.textContent = '';

  if (!research.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No research data yet — open the game then click Scrape Now.';
    container.appendChild(p);
    document.getElementById('tt-summary').textContent = '';
    return;
  }

  const levels = {};
  const branchOf = {};
  for (const t of research) { levels[t.key] = t.level || 0; branchOf[t.key] = t.branch; }
  ttResearch = research; ttLevelsRef = levels;
  renderLegend();
  document.getElementById('tt-summary').textContent =
    `${research.filter(t => (t.level || 0) > 0).length}/${research.length} researched · ` +
    `${research.filter(t => techStatus(t, levels) === 'maxed').length} maxed`;

  // Depth from the full graph (stable columns); render the selected branch.
  const depth = computeDepths(research);
  const branchFilter = document.getElementById('tt-branch').value;
  const shown = research.filter(t => branchFilter === 'all' || t.branch === branchFilter);

  // Adjacency among shown techs (research requirements only).
  const shownKeys = new Set(shown.map(t => t.key));
  const parents = {};   // key → [prereq keys]
  const children = {};  // key → [dependent keys]
  for (const t of shown) {
    parents[t.key] = (t.requirements || [])
      .filter(r => r.type === 'research' && shownKeys.has(r.key)).map(r => r.key);
    for (const p of parents[t.key]) (children[p] = children[p] || []).push(t.key);
  }

  // Lay out top-to-bottom (OGame style): row = depth, column = order in row.
  const rows = {};
  for (const t of shown) (rows[depth[t.key]] = rows[depth[t.key]] || []).push(t);
  const depthsSorted = Object.keys(rows).map(Number).sort((a, b) => a - b);
  for (const d of depthsSorted) {
    rows[d].sort((a, b) => BRANCH_ORDER.indexOf(a.branch) - BRANCH_ORDER.indexOf(b.branch)
      || (a.era - b.era) || (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Layered graph with dummy waypoints: every edge spanning more than one
  // rank is broken into a chain of invisible waypoints, one per intermediate
  // rank, so the crossing-reduction step can route it through the gaps
  // between nodes instead of slicing straight across them.
  const DUMMY_W = 8;
  const rankOf = {};                  // id → rank (reals + dummies)
  const isReal = {};                  // id → tech (reals only)
  const rankNodes = {};               // rank → [id...]
  const up = {}, down = {};           // id → neighbour ids in adjacent rank
  const adjSeen = new Set();
  const addAdj = (a, b) => {
    const k = `${a}>${b}`;
    if (adjSeen.has(k)) return;
    adjSeen.add(k);
    (down[a] = down[a] || []).push(b);
    (up[b] = up[b] || []).push(a);
  };
  for (const d of depthsSorted) {
    rankNodes[d] = [];
    for (const t of rows[d]) { rankNodes[d].push(t.key); isReal[t.key] = t; rankOf[t.key] = d; }
  }
  // Waypoints are shared per (source, rank): all long edges from one parent
  // reuse the same intermediate columns, so they merge into a single vertical
  // bus that fans out where each child attaches.
  const dummySource = {};            // dummy id → source (parent) key
  const wp = {};                     // `${pk}@${r}` → dummy id
  const edgeChains = [];             // { from, to, met, branch, ids:[start..end] }
  for (const t of shown) {
    for (const pk of parents[t.key]) {
      const r0 = depth[pk], r1 = depth[t.key];
      const ids = [pk];
      let prev = pk;
      for (let r = r0 + 1; r < r1; r++) {
        const key = `${pk}@${r}`;
        let id = wp[key];
        if (!id) {
          id = wp[key] = `__d_${pk}_${r}`;
          (rankNodes[r] = rankNodes[r] || []).push(id);
          rankOf[id] = r;
          dummySource[id] = pk;
        }
        addAdj(prev, id);
        prev = id;
        ids.push(id);
      }
      addAdj(prev, t.key);
      ids.push(t.key);
      edgeChains.push({ from: pk, to: t.key, met: levels[pk] > 0, branch: branchOf[pk], ids });
    }
  }
  const ranks = Object.keys(rankNodes).map(Number).sort((a, b) => a - b);

  // Crossing reduction over all ranks (reals + waypoints): barycenter
  // (mean & median) + adjacent-transpose refinement, keeping the ordering
  // with the fewest total edge crossings seen across rounds.
  const colOf = {};
  const reindex = () => { for (const r of ranks) rankNodes[r].forEach((id, i) => { colOf[id] = i; }); };
  reindex();

  // total edge crossings between every adjacent rank pair
  const crossings = () => {
    let total = 0;
    for (const r of ranks) {
      const es = [];
      for (const a of rankNodes[r]) for (const b of (down[a] || [])) es.push([colOf[a], colOf[b]]);
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
        if ((es[i][0] < es[j][0]) !== (es[i][1] < es[j][1]) &&
            es[i][0] !== es[j][0] && es[i][1] !== es[j][1]) total++;
      }
    }
    return total;
  };
  const snapshot = () => { const s = {}; for (const r of ranks) s[r] = rankNodes[r].slice(); return s; };
  const restore = (s) => { for (const r of ranks) rankNodes[r] = s[r].slice(); reindex(); };

  const aggregate = (vals, useMedian) => {
    if (!vals.length) return null;
    if (!useMedian) return vals.reduce((x, y) => x + y, 0) / vals.length;
    const s = [...vals].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const baryPass = (useMedian) => {
    for (let pass = 0; pass < 8; pass++) {
      const order = pass % 2 ? [...ranks].reverse() : ranks;
      const neigh = pass % 2 ? down : up;
      for (const r of order) {
        const score = {};
        for (const id of rankNodes[r]) {
          const v = aggregate((neigh[id] || []).map(k => colOf[k]), useMedian);
          score[id] = v === null ? colOf[id] : v;
        }
        rankNodes[r] = rankNodes[r]
          .map((id, i) => [id, score[id], i])
          .sort((a, b) => a[1] - b[1] || a[2] - b[2])
          .map(x => x[0]);
        rankNodes[r].forEach((id, i) => { colOf[id] = i; });
      }
    }
  };
  // crossings between two same-rank nodes' incident edges (u left of v)
  const pairCross = (u, v) => {
    let c = 0;
    for (const dir of [up, down]) {
      const us = dir[u] || [], vs = dir[v] || [];
      for (const a of us) for (const b of vs) if (colOf[a] > colOf[b]) c++;
    }
    return c;
  };
  const transpose = () => {
    let improved = true, guard = 0;
    while (improved && guard++ < 12) {
      improved = false;
      for (const r of ranks) {
        const row = rankNodes[r];
        for (let i = 0; i < row.length - 1; i++) {
          if (pairCross(row[i + 1], row[i]) < pairCross(row[i], row[i + 1])) {
            [row[i], row[i + 1]] = [row[i + 1], row[i]];
            colOf[row[i]] = i; colOf[row[i + 1]] = i + 1;
            improved = true;
          }
        }
      }
    }
  };

  let best = snapshot(), bestC = crossings();
  for (const useMedian of [false, true, false, true]) {
    baryPass(useMedian);
    transpose();
    const c = crossings();
    if (c < bestC) { bestC = c; best = snapshot(); }
  }
  restore(best);

  // Placement: pack each rank left→right (reals wide, waypoints narrow),
  // centre every rank on the widest.
  const slotW = id => (isReal[id] ? NODE_W : DUMMY_W);
  const rankW = r => rankNodes[r].reduce((s, id) => s + slotW(id), 0) + (rankNodes[r].length - 1) * GAP_X;
  const LABEL_W = 48;   // left gutter for tier labels
  const fullW = Math.max(...ranks.map(rankW));
  const cx = {};    // id → centre x
  const pos = {};   // real key → {x, y}
  for (const r of ranks) {
    let cur = PAD + LABEL_W + (fullW - rankW(r)) / 2;
    for (const id of rankNodes[r]) {
      const w = slotW(id);
      cx[id] = cur + w / 2;
      if (isReal[id]) pos[id] = { x: cx[id] - NODE_W / 2, y: PAD + r * (NODE_H + GAP_Y) };
      cur += w + GAP_X;
    }
  }
  // Straighten: pull each waypoint toward its bus source x so long edges drop
  // near-vertically; reals stay put, waypoints clamp within their rank order.
  for (let pass = 0; pass < 8; pass++) {
    for (const r of ranks) {
      const row = rankNodes[r];
      for (let i = 0; i < row.length; i++) {
        const id = row[i];
        if (isReal[id]) continue;
        let lo = -Infinity, hi = Infinity;
        if (i > 0) { const p = row[i - 1]; lo = cx[p] + slotW(p) / 2 + GAP_X + DUMMY_W / 2; }
        if (i < row.length - 1) { const n = row[i + 1]; hi = cx[n] - slotW(n) / 2 - GAP_X - DUMMY_W / 2; }
        let v = cx[dummySource[id]];
        if (lo > hi) v = (lo + hi) / 2;
        else v = Math.max(lo, Math.min(hi, v));
        cx[id] = v;
      }
    }
  }
  const width = PAD * 2 + LABEL_W + fullW;
  const height = PAD + (ranks[ranks.length - 1] + 1) * (NODE_H + GAP_Y);
  const rowMidY = r => PAD + r * (NODE_H + GAP_Y) + NODE_H / 2;

  const canvas = document.createElement('div');
  canvas.className = 'tt-canvas';
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'tt-edges');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  // Arrowhead marker (inherits each edge's stroke colour via context-stroke).
  const defs = document.createElementNS(SVGNS, 'defs');
  const marker = document.createElementNS(SVGNS, 'marker');
  marker.setAttribute('id', 'tt-arrow');
  marker.setAttribute('viewBox', '0 0 8 8');
  marker.setAttribute('refX', '7');
  marker.setAttribute('refY', '4');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const tip = document.createElementNS(SVGNS, 'path');
  tip.setAttribute('d', 'M0,0 L8,4 L0,8 z');
  tip.setAttribute('fill', 'context-stroke');
  marker.appendChild(tip);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Alternating row bands (behind everything) to anchor the eye horizontally.
  for (const r of ranks) {
    if (r % 2 === 0) continue;
    const band = document.createElementNS(SVGNS, 'rect');
    band.setAttribute('class', 'tt-band');
    band.setAttribute('x', 0);
    band.setAttribute('y', PAD + r * (NODE_H + GAP_Y) - GAP_Y / 2);
    band.setAttribute('width', width);
    band.setAttribute('height', NODE_H + GAP_Y);
    svg.appendChild(band);
  }

  // Tier labels in the left gutter.
  for (const r of ranks) {
    const lbl = document.createElementNS(SVGNS, 'text');
    lbl.setAttribute('class', 'tt-tier');
    lbl.setAttribute('x', PAD);
    lbl.setAttribute('y', rowMidY(r));
    lbl.textContent = `T${r}`;
    svg.appendChild(lbl);
  }

  // Edges: orthogonal polylines routed through the waypoint columns; coloured
  // by the prerequisite's branch, dashed + faded when the prereq is unmet.
  const edgeEls = [];   // { el, from, to }
  for (const e of edgeChains) {
    const pts = [];
    pts.push([cx[e.from], PAD + rankOf[e.from] * (NODE_H + GAP_Y) + NODE_H]);  // prereq bottom
    for (let i = 1; i < e.ids.length - 1; i++) pts.push([cx[e.ids[i]], rowMidY(rankOf[e.ids[i]])]);
    pts.push([cx[e.to], PAD + rankOf[e.to] * (NODE_H + GAP_Y)]);              // dependent top
    const d = roundedOrthoPath(pts, 8);
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'tt-edge');
    path.setAttribute('marker-end', 'url(#tt-arrow)');
    path.style.stroke = BRANCH_COLORS[e.branch] || '#30363d';
    if (e.met) {
      path.style.strokeOpacity = '0.85';
    } else {
      path.style.strokeOpacity = '0.35';
      path.style.strokeDasharray = '4 3';
    }
    svg.appendChild(path);
    edgeEls.push({ el: path, from: e.from, to: e.to });
  }
  canvas.appendChild(svg);

  const planKeys = new Set(buildPlan().map(s => s.key));
  const nodeEls = {};   // key → element
  for (const t of shown) {
    const p = pos[t.key];
    const node = document.createElement('div');
    node.className = `tt-node ${techStatus(t, levels)}`;
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    node.style.borderTop = `3px solid ${BRANCH_COLORS[t.branch] || '#30363d'}`;
    node.title = techTooltip(t, levels);
    const name = document.createElement('div');
    name.className = 'tt-node-name';
    name.textContent = t.name;
    const lvl = document.createElement('div');
    lvl.className = 'tt-node-level';
    lvl.textContent = `${t.branch} · ${t.level || 0}/${t.maxLevel || 1}`;
    node.append(name, lvl);
    if (!t.isMaxed) {
      const add = document.createElement('div');
      add.className = 'tt-add' + (planKeys.has(t.key) ? ' queued' : '');
      add.dataset.key = t.key;
      add.textContent = '+';
      add.title = 'Add one level to the research queue (with prerequisites)';
      add.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(t.key); });
      node.appendChild(add);
      if ((t.maxLevel || 1) > 1) {
        const mx = document.createElement('div');
        mx.className = 'tt-max';
        mx.textContent = '⤒';
        mx.title = `Queue to max level (${t.maxLevel})`;
        mx.addEventListener('click', (e) => { e.stopPropagation(); maxToQueue(t.key); });
        node.appendChild(mx);
      }
    }
    node.addEventListener('mouseenter', () => { if (!ttPinned) highlight(t.key); });
    node.addEventListener('mouseleave', () => { if (!ttPinned) clearHighlight(); });
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      if (ttDragged) return;   // was a pan, not a click
      ttPinned = ttPinned === t.key ? null : t.key;
      if (ttPinned) highlight(ttPinned); else clearHighlight();
    });
    nodeEls[t.key] = node;
    canvas.appendChild(node);
  }
  canvas.addEventListener('click', () => { if (ttDragged) return; ttPinned = null; clearHighlight(); });

  // Hover: light the hovered tech's whole prerequisite + dependent chain, dim
  // the rest, and brighten the connecting edges.
  function relatives(key) {
    const set = new Set([key]);
    const walk = (k, adj) => { for (const n of (adj[k] || [])) if (!set.has(n)) { set.add(n); walk(n, adj); } };
    walk(key, parents);
    walk(key, children);
    return set;
  }
  function highlight(key) {
    const set = relatives(key);
    for (const [k, el] of Object.entries(nodeEls)) el.classList.toggle('tt-dim', !set.has(k));
    for (const e of edgeEls) {
      const on = set.has(e.from) && set.has(e.to);
      e.el.classList.toggle('tt-edge-hi', on);
      e.el.classList.toggle('tt-dim', !on);
    }
  }
  function clearHighlight() {
    for (const el of Object.values(nodeEls)) el.classList.remove('tt-dim', 'tt-match');
    for (const e of edgeEls) e.el.classList.remove('tt-edge-hi', 'tt-dim');
  }

  // Search: highlight matching techs, dim the rest, scroll to the first match.
  function applySearch(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) { ttPinned = null; clearHighlight(); return; }
    ttPinned = null;
    const hits = shown.filter(t => t.name.toLowerCase().includes(q));
    const set = new Set(hits.map(t => t.key));
    for (const [k, el] of Object.entries(nodeEls)) {
      el.classList.toggle('tt-dim', !set.has(k));
      el.classList.toggle('tt-match', set.has(k));
    }
    for (const e of edgeEls) { e.el.classList.add('tt-dim'); e.el.classList.remove('tt-edge-hi'); }
    if (hits.length) {
      const p = pos[hits[0].key];
      const vp = document.getElementById('techtree');
      vp.scrollTo({
        left: p.x * ttZoom - vp.clientWidth / 2 + NODE_W * ttZoom / 2,
        top: p.y * ttZoom - vp.clientHeight / 2 + NODE_H * ttZoom / 2,
        behavior: 'smooth',
      });
    }
  }
  const searchEl = document.getElementById('tt-search');
  searchEl.oninput = () => applySearch(searchEl.value);

  container.appendChild(canvas);
  ttCanvas = canvas; ttCanvasW = width; ttCanvasH = height;
  applyZoom();
  if (!ttTargetsLoaded) loadTargets(); else renderQueue();
  if (!ttResources) fetchResources();
  if (searchEl.value) applySearch(searchEl.value);   // reapply after re-render
}

// Legend: branch colours, status colours, edge meaning.
export function renderLegend() {
  const el = document.getElementById('tt-legend');
  if (!el) return;
  const swatch = (color, label, kind) =>
    `<span class="tt-leg-item"><span class="tt-leg-${kind}" style="background:${color}"></span>${label}</span>`;
  const branches = BRANCH_ORDER.map(b => swatch(BRANCH_COLORS[b], b, 'dot')).join('');
  const status = STATUS_LEGEND.map(([, c, l]) => swatch(c, l, 'bar')).join('');
  el.innerHTML =
    `<span class="tt-leg-group">Branch: ${branches}</span>` +
    `<span class="tt-leg-group">Status: ${status}</span>` +
    `<span class="tt-leg-group tt-leg-muted">solid edge = prereq met · dashed = unmet · click a tech to pin its chain</span>`;
}

document.getElementById('tt-queue-clear').addEventListener('click', () => {
  ttTargets = []; renderQueue(); updateQueueBadges();
});
document.getElementById('tt-branch').addEventListener('change', () => { ttZoom = 1; renderTechTreeTab(); });
document.getElementById('tt-fit').addEventListener('click', () => {
  const vp = document.getElementById('techtree');
  ttZoom = ttCanvasW ? Math.min(1, vp.clientWidth / ttCanvasW) : 1;
  applyZoom();
});

// Click-drag panning + wheel zoom of the tech tree viewport.
(function () {
  const vp = document.getElementById('techtree');
  let panning = false, sx = 0, sy = 0, sl = 0, st = 0;
  vp.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    panning = true; ttDragged = false;
    sx = e.clientX; sy = e.clientY; sl = vp.scrollLeft; st = vp.scrollTop;
    vp.classList.add('tt-grabbing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) ttDragged = true;
    vp.scrollLeft = sl - dx;
    vp.scrollTop = st - dy;
  });
  window.addEventListener('mouseup', () => {
    if (!panning) return;
    panning = false;
    vp.classList.remove('tt-grabbing');
    // let the trailing click fire & read ttDragged, then reset
    setTimeout(() => { ttDragged = false; }, 0);
  });

  // Wheel zooms toward the cursor (keeps the point under the mouse fixed).
  vp.addEventListener('wheel', (e) => {
    if (!ttCanvas) return;
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const px = e.clientX - rect.left + vp.scrollLeft;   // viewport content coords
    const py = e.clientY - rect.top + vp.scrollTop;
    const cx = px / ttZoom, cy = py / ttZoom;            // unscaled canvas coords
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    ttZoom = Math.min(2.5, Math.max(0.2, ttZoom * factor));
    applyZoom();
    vp.scrollLeft = cx * ttZoom - (e.clientX - rect.left);
    vp.scrollTop = cy * ttZoom - (e.clientY - rect.top);
  }, { passive: false });
})();
