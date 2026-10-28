// Galaxy page: a "Next Survey" button in the game's search bar. Opens the
// nearest system (from the colony shown in the planet switcher, by
// /api/galaxy/map coordinates) that is not on survey cooldown and has no
// survey mission already flying to or scanning it. Zone chips next to it
// narrow which security zones it may pick; the survey count of the day
// (from /api/fleet/survey-cooldowns) sits beside them.
//
// The game's own Survey button is replaced by the same "Next Survey" shortcut
// while it is greyed out because the selected system is on cooldown (live
// countdown below) or a scout is already on its way. The reason comes from
// the cooldown and mission data, not the button text, so any client language
// works. Other reasons ("No recon ships") are left alone: another system
// would not fix them.
//
// Opening the system goes through the game's own router (pushState +
// popstate), so the app is not reloaded. Never starts a survey: the player
// clicks the game's Survey button.
//
// Calls go through NexusTransport.call (dynamic-transport.js): /galaxy/map
// only answers the encoded form on universes with the dynamic API (nf2).
// IIFE + re-run guard: a second injection would otherwise throw on the
// top-level declarations.
(() => {
  if (globalThis.NexusGalaxySurvey) return;
  const ext = globalThis.browser || globalThis.chrome;

  const ZONES = [['sentinel', 'Sentinel', '#56d364'], ['open', 'Open', '#e0954a'], ['dead', 'Dead', '#ef7373']];
  const ZONES_KEY = 'survey_zones';   // { sentinel: bool, … }, missing = on
  const BTN_ID = 'nx-survey-next';
  const BAR_ID = 'nx-survey-bar';

  // ── Pure part (tests/galaxy-survey.test.js) ──

  // Nearest system to `from` not on cooldown, not targeted by an outbound or
  // scanning survey, and in an allowed zone (allowed = null: any zone).
  // `from` itself counts (distance 0) when it qualifies.
  function nearestSurveyable({ systems, from, cooldowns, missions, allowed, now = Date.now() }) {
    const busy = new Set((missions || [])
      .filter(m => m.missionType === 'survey' && (m.status === 'outbound' || m.status === 'surveying'))
      .map(m => Number(m.targetSystemId)));
    for (const c of cooldowns || []) if (Date.parse(c.cooldownEndsAt) > now) busy.add(Number(c.systemId));
    let best = null, bestD = Infinity;
    for (const s of systems || []) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || busy.has(Number(s.id))) continue;
      if (allowed && !allowed.has(s.securityZone)) continue;
      const d = Math.hypot(s.x - from.x, s.y - from.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best && { ...best, distance: bestD };
  }

  // Why a survey of `systemId` can't start now: { endsAt } while on cooldown,
  // { busy: true } while a survey is outbound to or scanning it, else null.
  function surveyBlock(systemId, cooldowns, missions, now = Date.now()) {
    const id = Number(systemId);
    for (const c of cooldowns || []) {
      const endsAt = Date.parse(c.cooldownEndsAt);
      if (Number(c.systemId) === id && endsAt > now) return { endsAt };
    }
    return (missions || []).some(m => m.missionType === 'survey' && Number(m.targetSystemId) === id &&
      (m.status === 'outbound' || m.status === 'surveying')) ? { busy: true } : null;
  }

  // "4:05" under an hour, "1:02:03" past it.
  function fmtLeft(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    const p = n => String(n).padStart(2, '0');
    const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
    return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
  }

  globalThis.NexusGalaxySurvey = Object.freeze({ nearestSurveyable, surveyBlock, fmtLeft });
  if (typeof document === 'undefined' || !ext?.storage) return;   // test sandbox

  // ── Page part ──

  async function api(path) {
    const r = await globalThis.NexusTransport.call('GET', path);
    if (r.status < 200 || r.status >= 300) throw new Error(`${path.split('?')[0]} → ${r.status}`);
    return r.data;
  }

  let systems = null;   // the map does not change during a session
  let cooldowns = null, missions = null, fetchedAt = 0;
  let zones = {};
  let dailyCount = null;

  // Map once, cooldowns + missions each time (single flight).
  let loading = null;
  function refresh() {
    return loading ||= (async () => {
      const [map, cd, ms] = await Promise.all([
        systems ? null : api('/api/galaxy/map'),
        api('/api/fleet/survey-cooldowns'),
        api('/api/fleet/missions'),
      ]);
      if (map) systems = map.systems || [];
      cooldowns = cd.cooldowns || [];
      missions = ms.missions || [];
      dailyCount = cd.dailySurveyCount ?? null;
      paintBar();
    })().finally(() => { loading = null; fetchedAt = Date.now(); });   // a failure waits too
  }

  const byName = name => name && systems?.find(s => String(s.name || '').toUpperCase() === name.toUpperCase());

  // System the galaxy panel shows: the last breadcrumb (Galaxy › Arm ›
  // Sector › System). The URL is no help, the app drops ?system= on arrival.
  function selectedSystem() {
    const crumbs = document.querySelectorAll('.galaxy-panel .bread-item');
    return byName(crumbs[crumbs.length - 1]?.textContent.trim());
  }

  // Colony shown in the planet switcher, e.g. "[E45-30]".
  function currentSystem() {
    const m = /([A-Z]{1,3}\d+-\d+)/i.exec(document.querySelector('.planet-switcher-btn .ps-system')?.textContent || '');
    return byName(m && m[1]);
  }

  function allowedZones() {
    const off = ZONES.filter(([z]) => zones[z] === false);
    return off.length ? new Set(ZONES.map(([z]) => z).filter(z => zones[z] !== false)) : null;
  }

  const LABEL = '📡 Next Survey';
  // Shows a result in `el` for 3 s, then puts the label back.
  function flash(el, text) {
    el.textContent = text;
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { el.textContent = LABEL; }, 3000);
  }

  // btn: the button to disable meanwhile; el: where the result shows.
  async function next(btn, el = btn) {
    btn.disabled = true;
    try {
      await refresh();
      const from = currentSystem();
      if (!from) return flash(el, 'Current system unknown');
      const target = nearestSurveyable({ systems, from, cooldowns, missions, allowed: allowedZones() });
      if (!target) return flash(el, 'No system to survey');
      history.pushState({}, '', `/galaxy?system=${target.id}`);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      flash(el, `→ ${target.name || `#${target.id}`} (${Math.round(target.distance)})`);
    } catch (e) {
      flash(el, `Error: ${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  const chip = 'height:26px; padding:0 8px; border-radius:5px; border:1px solid; background:#1a1f2b; font-size:.68rem; font-weight:700; white-space:nowrap;';

  function paintBar() {
    const bar = document.getElementById(BAR_ID);
    if (!bar) return;
    bar.textContent = '';
    for (const [z, label, color] of ZONES) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.title = `Next Survey may pick ${label} systems (click to toggle)`;
      b.style.cssText = `${chip} cursor:pointer; color:${color}; border-color:${color}; opacity:${zones[z] === false ? 0.35 : 1};`;
      b.onclick = () => ext.storage.local.set({ [ZONES_KEY]: { ...zones, [z]: zones[z] === false } });
      bar.appendChild(b);
    }
    if (dailyCount != null) {
      const c = document.createElement('span');
      c.textContent = `📡 ${dailyCount}`; c.title = 'Surveys started today';
      c.style.cssText = `${chip} display:inline-flex; align-items:center; color:#9aa4b2; border-color:#3a4256;`;
      bar.appendChild(c);
    }
  }

  function inject() {
    const search = document.querySelector('.galaxy-search');
    if (!search || document.getElementById(BTN_ID)) return;
    // The search bar stacks its children; one row keeps ours beside the box.
    search.style.cssText += 'display:flex; flex-direction:row; align-items:center; gap:8px; flex-wrap:nowrap;';
    const btn = document.createElement('button');
    btn.id = BTN_ID; btn.type = 'button'; btn.textContent = LABEL;
    btn.title = 'Open the nearest system you can survey (addon)';
    btn.style.cssText = 'flex-shrink:0; height:32px; padding:0 10px; background:#1a1f2b; color:#ddd; border:1px solid #3a4256; border-radius:6px; font-size:.78rem; font-weight:600; cursor:pointer; white-space:nowrap;';
    btn.onclick = () => next(btn);
    const bar = document.createElement('div');
    bar.id = BAR_ID; bar.style.cssText = 'display:flex; align-items:center; gap:4px; flex-shrink:0;';
    search.append(btn, bar);
    paintBar();
  }

  // The native button is hidden, not rewritten: React keeps its own nodes,
  // and showing it again is all it takes once it is usable (or another system
  // is selected). Ours copies its classes for the game's pill style.
  let tick = null;
  function swapSurveyButton() {
    const nat = document.querySelector('.survey-btn:not(.nx-next-survey)');
    let mine = document.querySelector('.nx-next-survey');
    const sel = nat?.disabled && selectedSystem();
    const block = sel && cooldowns && surveyBlock(sel.id, cooldowns, missions);
    // Greyed out for no reason we know of (maybe a survey sent since the last
    // fetch), or a survey under way that may have finished: look again, at
    // most every 15 s.
    if (nat?.disabled && (!block || block.busy) && !loading && Date.now() - fetchedAt > 15000) refresh().then(scan, () => {});
    if (!block) {
      nat?.style.removeProperty('display');
      mine?.remove();
      clearInterval(tick); tick = null;
      return;
    }
    nat.style.setProperty('display', 'none', 'important');
    if (!mine || mine.previousElementSibling !== nat) {
      mine?.remove();
      mine = document.createElement('button');
      mine.type = 'button';
      mine.className = `${nat.className} nx-next-survey`;
      mine.title = 'Open the nearest system you can survey (addon)';
      mine.style.cssText = 'display:flex; flex-direction:column; align-items:center; height:auto; gap:2px;';
      const label = document.createElement('span');
      label.textContent = LABEL;
      const sub = document.createElement('small');
      sub.style.cssText = 'font-size:.65rem; opacity:.75; font-variant-numeric:tabular-nums;';
      mine.append(label, sub);
      mine.onclick = () => next(mine, label);
      nat.after(mine);
    }
    // This runs on every DOM change, ours included: only act when the state
    // changed, and only write text that differs, or it would feed itself.
    const key = `${sel.id}|${block.endsAt || 'busy'}`;
    if (mine.__key === key) return;
    mine.__key = key;
    const sub = mine.lastChild;
    const say = t => { if (sub.textContent !== t) sub.textContent = t; };
    clearInterval(tick); tick = null;
    if (block.busy) return say('Survey under way');
    const paint = () => {
      const left = block.endsAt - Date.now();
      say(`⏳ ${fmtLeft(left)}`);
      // Over: the game re-enables its button on its next render; until then
      // show it as it is.
      if (left <= 0) { clearInterval(tick); tick = null; cooldowns = cooldowns.filter(c => Number(c.systemId) !== Number(sel.id)); scan(); }
    };
    paint();
    if (block.endsAt > Date.now()) tick = setInterval(paint, 1000);
  }

  ext.storage.local.get(ZONES_KEY).then(r => { zones = r[ZONES_KEY] || {}; paintBar(); }).catch(() => {});
  ext.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch[ZONES_KEY]) { zones = ch[ZONES_KEY].newValue || {}; paintBar(); }
  });
  const scan = () => { inject(); swapSurveyButton(); };
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
  scan();
})();
