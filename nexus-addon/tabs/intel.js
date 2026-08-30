// Shared Intel tab — spy reports your alliance pooled via the Discord channel.
//
// There is one spy_reports store: your own scans and everything Sync pulled in
// live side by side, and an imported report carries a `shared_by` name (see
// mergeSpyReports in background.js). This tab is the view over that pool.
//
// Reports are grouped by target, because the useful question is "what do we
// know about this planet", not "what happened at 14:32". Inside a group the
// scans run newest-first, so the top one is the current picture and the older
// ones are the history behind it.

import { PER_PAGE, RESOURCE_SERIES, fmt, selectedUniverse, store } from '../common.js';

export const YOU = 'You';

// Contributor for a report: an imported one carries `shared_by`, your own scans
// do not. Kept in one place so the label never drifts.
export function contributorOf(r) {
  return r.shared_by || YOU;
}

// The API sends resource keys camelCase (cryoIce); the dashboard's shared
// RESOURCE_SERIES labels/colours are keyed snake_case (cryo_ice). Bridge them
// so this tab reuses the same palette as every other resource display.
const snake = k => k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const RES_META = Object.fromEntries(RESOURCE_SERIES.map(d => [d.field, d]));

// Resource → the --res-* token that colours its bar/value. Anything outside the
// named set (cryo ice, dark matter, artifacts…) rides the shared "rare" colour.
export const RES_VAR = {
  ore: 'ore', silicates: 'silicates', hydrogen: 'hydrogen',
  alloys: 'alloys', plasma_core: 'plasma',
};

export function resourceVar(key) {
  return `var(--res-${RES_VAR[snake(key)] || 'rare'})`;
}

// ── Icons ──────────────────────────────────────────────────────────────────
// Game art, not bundled assets: the paths are deterministic and keyed by the
// same identifiers the reports already carry (docs/api/get/images.md). Every
// image is best-effort — a missing one hides itself rather than showing a
// broken frame, which is how the rest of the addon treats game art.

export const gameBase = () => `https://${selectedUniverse}.nexuslegacy.space`;

export function resourceIconUrl(key) {
  return `${gameBase()}/images/resources/${snake(key)}.webp`;
}

// Building/defense art is split across directories: planet buildings sit under
// the race, outpost structures under `outpost`, and a spy report does not say
// which kind of target it scanned. Return both candidates and let the <img>
// fall through on 404 — verified against the 41 distinct keys in a live sweep,
// which this covers bar five moon-only structures that have no art at all.
export function buildingIconUrls(key, race) {
  if (!key) return [];
  const base = gameBase();
  const urls = [];
  if (race) urls.push(`${base}/api/images/buildings/${race}/${key}.webp`);
  urls.push(`${base}/api/images/buildings/outpost/${key}.webp`);
  return urls;
}

export function resourceLabel(key) {
  const meta = RES_META[snake(key)];
  if (meta) return meta.label;
  return snake(key).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Resource lines for one report, biggest first. `tier` rides along in
// resourceData as a precision marker ("exact"/estimate) — it is metadata, not a
// resource, so it never becomes a row.
export function resourceEntries(resources = {}) {
  return Object.entries(resources || {})
    .filter(([k, v]) => k !== 'tier' && typeof v === 'number' && v !== 0)
    .map(([key, value]) => ({ key, label: resourceLabel(key), value }))
    .sort((a, b) => b.value - a.value);
}

// Building categories, taken from `definition.category` on the live planet and
// moon payloads (see docs/api/get/planets_detail.md, moon_detail.md). Spy
// reports only carry {key, name, level}, so the mapping lives here.
// The last five are outpost structures, which carry no category server-side.
export const BUILDING_CATEGORY = {
  // resource
  ore_mine: 'resource', silicate_mine: 'resource', hydrogen_processor: 'resource',
  alloy_foundry: 'resource', quantum_synthesizer: 'resource', rare_extractor: 'resource',
  molecular_assembler: 'resource', ice_harvester: 'resource', regolith_extractor: 'resource',
  silicate_processor: 'resource', low_g_refinery: 'resource', extractor: 'resource',
  // energy
  solar_plant: 'energy', thermal_plant: 'energy', fusion_reactor: 'energy',
  zero_point_gen: 'energy', solar_collector: 'energy',
  // military
  p_shipyard: 'military', orbital_dock: 'military', orbital_shipyard: 'military',
  stealth_field: 'military', dock: 'military',
  // utility
  research_lab: 'utility', residential: 'utility', bio_complex: 'utility',
  storage_complex: 'utility', construction_yard: 'utility', logistics_hub: 'utility',
  medical_bay: 'utility', diplomatic_embassy: 'utility', cultural_center: 'utility',
  terraforming_station: 'utility', trade_hub: 'utility', quantum_nexus: 'utility',
  dyson_sphere: 'utility', jump_gate: 'utility', sensor_array: 'utility',
  lunar_warehouse: 'utility', storage: 'utility',
  // defense — these arrive in buildingData too, and get folded into the
  // Defenses column rather than shown twice.
  shield_generator: 'defense', planetary_shield: 'defense', railgun_defense: 'defense',
  plasma_defense: 'defense', laser_defense: 'defense', missile_defense: 'defense',
  ion_defense: 'defense', aa_turret: 'defense', defense_traps: 'defense',
  ew_system: 'defense', garrison: 'defense', storage_cloaking: 'defense',
  defense_platform: 'defense', shield: 'defense', turret: 'defense',
};

// Columns the user reads, in order. Anything unmapped falls to "Other" so a new
// building key shows up instead of vanishing.
export const BUILDING_COLUMNS = [
  ['resource', 'Resources'],
  ['energy', 'Energy'],
  ['military', 'Military'],
  ['utility', 'Utility'],
  ['other', 'Other'],
];

export function categoryOf(key) {
  return BUILDING_CATEGORY[key] || 'other';
}

// Group buildings into the display columns, level-descending inside each.
// Defense-category entries are excluded — they belong to the Defenses column.
export function buildingColumns(buildings = []) {
  const by = {};
  for (const b of (buildings || [])) {
    if (!b || !(b.key || b.name)) continue;
    const cat = categoryOf(b.key);
    if (cat === 'defense') continue;
    (by[cat] ||= []).push(b);
  }
  return BUILDING_COLUMNS
    .filter(([cat]) => by[cat] && by[cat].length)
    .map(([cat, label]) => ({
      cat,
      label,
      items: by[cat].sort((a, b) => (b.level || 0) - (a.level || 0)),
    }));
}

// Defences split: the shield generator is the one that gates whether an attack
// lands at all, so it is called out rather than buried in the turret list.
export const SHIELD_KEYS = new Set(['shield_generator', 'planetary_shield', 'shield']);

// Defence rows for a scan: defenseData plus any defense-category entries that
// only showed up in buildingData. Deduped by key, highest level wins, so a
// turret listed in both places renders once.
export function defenseRows(scan = {}) {
  const rows = new Map();
  const add = d => {
    if (!d || !(d.key || d.name)) return;
    const k = d.key || d.name;
    const prev = rows.get(k);
    if (!prev || (d.level || 0) > (prev.level || 0)) rows.set(k, d);
  };
  const list = Array.isArray(scan.defense) ? scan.defense : (scan.defense ? [scan.defense] : []);
  for (const d of list) add(d);
  for (const b of (scan.buildings || [])) if (categoryOf(b.key) === 'defense') add(b);
  return [...rows.values()];
}

export function splitDefenses(defense) {
  const all = Array.isArray(defense) ? defense : (defense ? [defense] : []);
  const rows = all.filter(d => d && (d.key || d.name));
  return {
    shield: rows.filter(d => SHIELD_KEYS.has(d.key)),
    turrets: rows.filter(d => !SHIELD_KEYS.has(d.key)).sort((a, b) => (b.level || 0) - (a.level || 0)),
  };
}

// Short fleet summary for the collapsed group header.
export function fleetText(fleet) {
  // `|| []`, not a default param: shared payloads are parsed from remote JSON
  // and validated only at the envelope level, so an ally on an older build can
  // hand us `fleet: null` — which a default param does not catch, and which
  // blanks the whole tab from inside renderGroup. Every sibling normalises the
  // same way.
  const list = fleet || [];
  if (!list.length) return '—';
  const sorted = [...list].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
  const head = sorted.slice(0, 3).map(f => `${f.quantity}× ${f.name || f.key}`).join(', ');
  return sorted.length > 3 ? `${head} +${sorted.length - 3} more` : head;
}

// One group per target, scans newest-first inside each; groups ordered by their
// most recent scan. Target identity is owner+planet, so two players' planets
// that happen to share a name stay apart. Pure — the unit test drives this.
export function groupByTarget(reports = [], sharedOnly = false) {
  const groups = new Map();
  for (const r of (reports || [])) {
    if (!r || r.id == null) continue;
    if (sharedOnly && !r.shared_by) continue;
    const name = r.target_name || 'unknown target';
    const key = `${r.target_user || '—'}::${name}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        target_name: name,
        target_user: r.target_user || null,
        system: r.target_system_name || (r.target_system_id != null ? `#${r.target_system_id}` : null),
        scans: [],
      });
    }
    groups.get(key).scans.push({ ...r, contributor: contributorOf(r) });
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.scans.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    g.latest = g.scans[0].created_at || '';
    g.contributors = [...new Set(g.scans.map(s => s.contributor))];
  }
  return out.sort((a, b) => b.latest.localeCompare(a.latest));
}

export const UNKNOWN_PLAYER = 'Unknown owner';

// Owner of a target, for the player picker. Planets with no recorded owner
// (outposts, abandoned worlds) collapse into one bucket rather than vanishing.
export function ownerOf(r) {
  return r.target_user || UNKNOWN_PLAYER;
}

// Players seen in the pool, with how much intel exists on each. Ordered by
// planet count then scans, so the players you know most about sit on top.
// Pure — the unit test drives this.
export function playerList(reports = [], sharedOnly = false) {
  const byPlayer = new Map();
  for (const g of groupByTarget(reports, sharedOnly)) {
    const name = g.target_user || UNKNOWN_PLAYER;
    if (!byPlayer.has(name)) byPlayer.set(name, { name, planets: 0, scans: 0 });
    const p = byPlayer.get(name);
    p.planets++;
    p.scans += g.scans.length;
  }
  return [...byPlayer.values()].sort((a, b) =>
    b.planets - a.planets || b.scans - a.scans || a.name.localeCompare(b.name));
}

export function intelSummary(reports = []) {
  const rows = (reports || []).filter(r => r && r.id != null);
  const shared = rows.filter(r => r.shared_by);
  return {
    total: rows.length,
    shared: shared.length,
    own: rows.length - shared.length,
    contributors: new Set(shared.map(contributorOf)).size,
    targets: groupByTarget(rows).length,
  };
}

// Loot estimate for a scan. Amounts can come back qualitative when spy power is
// low; then there is no total to divide, and the caller drops the sub-line.
export const LOOT_FACTOR = 0.5;   // assumed lootable share, mirrors simulator-intel.js
export const TURRET_SCALE = 12;   // turret bars run against L12
export const BAR_MIN_PCT = 2;     // so a tiny value stays visible

export function lootEstimate(resources = {}, freighterCapacity = null) {
  let total = 0;
  let qualitative = false;
  for (const [k, v] of Object.entries(resources || {})) {
    if (k === 'tier') continue;
    if (typeof v === 'number') total += v;
    else if (v && v !== 'none') qualitative = true;
  }
  const loot = total * LOOT_FACTOR;
  return {
    total,
    loot,
    qualitative: total === 0 && qualitative,
    freighters: freighterCapacity ? Math.ceil(loot / freighterCapacity) : null,
  };
}

// Bar fill as a percentage of the scan's largest value, floored so a small
// value still shows something.
export function barPct(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(BAR_MIN_PCT, Math.min(100, (value / max) * 100));
}

export function turretPct(level) {
  return barPct(Math.min(level || 0, TURRET_SCALE), TURRET_SCALE);
}

// ── Render ─────────────────────────────────────────────────────────────────

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// Best-effort game art: try each candidate path in turn, and remove the element
// once they are all exhausted so a missing icon leaves the row intact.
function iconImg(srcs, cls) {
  const list = (Array.isArray(srcs) ? srcs : [srcs]).filter(Boolean);
  if (!list.length) return null;
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.loading = 'lazy';
  let i = 0;
  img.onerror = () => { i += 1; if (i < list.length) img.src = list[i]; else img.remove(); };
  img.src = list[0];
  return img;
}

// label / value line above a 3px bar — the one row shape all three columns use.
function barRow(label, value, pct, color, iconSrc) {
  const row = document.createElement('div');
  const line = el('div', 'intel-row-line');
  const l = el('span', 'intel-row-label');
  const icon = iconImg(iconSrc, 'intel-icon');
  if (icon) l.append(icon);
  l.append(document.createTextNode(label));
  const v = el('span', 'intel-row-value', value);
  if (color) v.style.color = color;
  line.append(l, v);
  const bar = el('div', 'intel-bar');
  const fill = document.createElement('span');
  fill.style.width = `${pct}%`;
  if (color) fill.style.background = color;
  bar.append(fill);
  row.append(line, bar);
  return row;
}

function column(label, totalText) {
  const col = document.createElement('div');
  const head = el('div', 'intel-col-head');
  head.append(el('span', 'intel-col-label', label));
  if (totalText != null) head.append(el('span', 'intel-col-total', totalText));
  col.append(head);
  return col;
}

// Firefox MV3 treats host_permissions as OPTIONAL: declaring discord.com in the
// manifest does not grant it, and an update that adds an origin never grants it
// silently. Without the grant the background fetch is a plain cross-origin
// request and Discord's reply is CORS-blocked. Ask from the click itself —
// permissions.request needs a user gesture, and resolves true with no prompt
// when the origin is already granted.
export const DISCORD_ORIGINS = ['https://discord.com/*', 'https://cdn.discordapp.com/*'];

export function requestDiscordAccess() {
  if (!browser.permissions) return Promise.resolve(true);   // older engines: nothing to ask
  return browser.permissions.request({ origins: DISCORD_ORIGINS }).catch(() => false);
}

// Post this one report to the alliance Discord channel. The whole-pool Share
// button lives in the tab's Alliance sharing panel; this is the "just this
// target" path.
function shareButton(scan) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'intel-share';
  btn.textContent = 'Share';
  btn.title = scan.shared_by
    ? 'Post this report to the alliance Discord channel again'
    : 'Post this report to the alliance Discord channel';
  btn.onclick = async (e) => {
    e.preventDefault();      // the header sits inside <details>; do not toggle it
    e.stopPropagation();
    const was = btn.textContent;
    const allowed = await requestDiscordAccess();
    if (!allowed) {
      btn.textContent = 'Failed';
      btn.title = 'Access to discord.com was declined. Enable it in about:addons → Nexus Accounting → Permissions.';
      btn.classList.add('failed');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Posting…';
    try {
      const res = await browser.runtime.sendMessage({ type: 'SHARE_SPY_INTEL', reportIds: [scan.id] });
      if (res && res.error) {
        btn.textContent = 'Failed';
        btn.title = res.error;
        btn.classList.add('failed');
      } else {
        btn.textContent = 'Shared ✓';
        btn.classList.add('done');
      }
    } catch (err) {
      btn.textContent = 'Failed';
      btn.title = String(err && err.message || err);
      btn.classList.add('failed');
    }
    // A failure carries the reason on the tooltip, so leave it up to be read;
    // only the success state times out.
    btn.disabled = false;
    if (!btn.classList.contains('failed')) {
      setTimeout(() => {
        btn.textContent = was;
        btn.classList.remove('done');
      }, 2500);
    }
  };
  return btn;
}

const SHIELD_SVG = '<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' +
  '<path d="M208 40H48a16 16 0 0 0-16 16v56c0 96 81 128 96 133a16 16 0 0 0 10 0c15-5 96-37 96-133V56a16 16 0 0 0-16-16Zm-32 66-56 56a8 8 0 0 1-12 0l-24-24a8 8 0 0 1 12-12l18 18 50-50a8 8 0 0 1 12 12Z"/></svg>';

function lootColumn(scan, freighterCapacity) {
  const rows = resourceEntries(scan.resources);
  const est = lootEstimate(scan.resources, freighterCapacity);
  const col = column('Loot', est.total ? fmt(est.total) : '—');

  // Qualitative amounts carry no total to halve, so the sub-line is dropped.
  if (!est.qualitative && est.total > 0) {
    const bits = [`~${fmt(Math.round(est.loot))} lootable`];
    if (est.freighters) bits.push(`${fmt(est.freighters)}× Freighter`);
    col.append(el('div', 'intel-col-sub', bits.join(' · ')));
  } else {
    col.append(el('div', 'intel-col-sub', est.qualitative ? 'amounts are qualitative' : ''));
  }

  const body = el('div', 'intel-rows');
  if (!rows.length) body.append(el('div', 'intel-none', 'none reported'));
  const max = rows.length ? rows[0].value : 0;
  for (const r of rows) {
    const color = resourceVar(r.key);
    body.append(barRow(r.label, fmt(r.value), barPct(r.value, max), color, resourceIconUrl(r.key)));
  }
  col.append(body);
  return col;
}

function fleetColumn(scan) {
  const fleet = [...(scan.fleet || [])].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
  const ships = fleet.reduce((s, f) => s + (f.quantity || 0), 0);
  const col = column('Fleet', ships ? fmt(ships) : '—');
  col.append(el('div', 'intel-col-sub',
    fleet.length ? `ships across ${fleet.length} class${fleet.length > 1 ? 'es' : ''}` : ''));
  const body = el('div', 'intel-rows');
  if (!fleet.length) body.append(el('div', 'intel-none', 'none reported'));
  const max = fleet.length ? (fleet[0].quantity || 0) : 0;
  for (const f of fleet) {
    const def = shipsByKey[f.key] || shipsById[f.shipDefId];
    body.append(barRow(f.name || f.key, fmt(f.quantity || 0),
      barPct(f.quantity || 0, max), 'var(--color-danger)', def && def.imageUrl));
  }
  col.append(body);
  return col;
}

function defenseColumn(scan) {
  const { shield, turrets } = splitDefenses(defenseRows(scan));
  const col = column('Defenses', null);
  const body = document.createElement('div');

  for (const s of shield) {
    const panel = el('div', 'intel-shield');
    const icon = document.createElement('span');
    icon.innerHTML = SHIELD_SVG;   // static markup, no report data interpolated
    const art = iconImg(buildingIconUrls(s.key, gameRace), 'intel-icon-lg');
    panel.append(icon.firstChild);
    if (art) panel.append(art);
    panel.append(el('span', 'intel-shield-label', s.name || s.key),
      el('span', 'intel-shield-level', `L${s.level ?? '?'}`));
    body.append(panel);
  }

  const rows = el('div', 'intel-rows');
  if (!shield.length && !turrets.length) rows.append(el('div', 'intel-none', 'none reported'));
  for (const d of turrets) {
    const row = el('div', 'intel-turret');
    const label = el('span', 'intel-turret-label');
    const art = iconImg(buildingIconUrls(d.key, gameRace), 'intel-icon');
    if (art) label.append(art);
    label.append(document.createTextNode(d.name || d.key));
    label.title = d.name || d.key;
    const bar = el('div', 'intel-bar');
    const fill = document.createElement('span');
    fill.style.width = `${turretPct(d.level)}%`;
    fill.style.background = 'var(--color-accent)';
    bar.append(fill);
    row.append(label, bar, el('span', 'intel-turret-level', `L${d.level ?? '?'}`));
    rows.append(row);
  }
  body.append(rows);
  col.append(body);
  return col;
}

function renderScan(scan, freighterCapacity) {
  const wrap = el('div', 'intel-scan');

  const head = el('div', 'intel-scan-head');
  head.append(el('span', 'intel-scan-when',
    scan.created_at ? new Date(scan.created_at).toLocaleString() : 'unknown date'));
  const by = el('span', 'intel-scan-by');
  by.append(document.createTextNode('scanned by '));
  const who = el('span', `intel-scan-contrib${scan.shared_by ? ' shared' : ''}`, scan.contributor);
  by.append(who);
  head.append(by);
  if (scan.outcome) head.append(el('span', 'intel-scan-by', `· ${scan.outcome}`));
  const tier = (scan.resources || {}).tier;
  if (tier) head.append(el('span', 'intel-tier', tier));
  head.append(shareButton(scan));
  wrap.append(head);

  const cols = el('div', 'intel-cols');
  cols.append(lootColumn(scan, freighterCapacity), fleetColumn(scan), defenseColumn(scan));
  wrap.append(cols);

  const bCols = buildingColumns(scan.buildings);
  const count = bCols.reduce((s, c) => s + c.items.length, 0);
  const bWrap = el('div', 'intel-buildings');
  bWrap.append(el('div', 'intel-col-label', `Buildings (${count})`));
  if (!count) {
    bWrap.append(el('div', 'intel-none', 'none reported'));
  } else {
    const grid = el('div', 'intel-building-cols');
    for (const c of bCols) {
      const colEl = el('div', 'intel-building-col');
      colEl.append(el('div', 'intel-building-cat', c.label));
      const list = el('div', 'intel-buildings-list');
      for (const b of c.items) {
        const item = el('span', 'intel-building');
        const art = iconImg(buildingIconUrls(b.key, gameRace), 'intel-icon');
        if (art) item.append(art);
        item.append(el('span', 'intel-building-name', b.name || b.key));
        item.append(el('span', 'intel-building-level', `L${b.level ?? '?'}`));
        list.append(item);
      }
      colEl.append(list);
      grid.append(colEl);
    }
    bWrap.append(grid);
  }
  wrap.append(bWrap);

  return wrap;
}

function renderGroup(g, freighterCapacity) {
  const box = document.createElement('details');
  box.className = 'intel-group';

  const sum = document.createElement('summary');
  sum.append(el('span', 'intel-group-name', g.target_name));
  sum.append(el('span', 'intel-group-sub',
    [g.target_user || 'unknown owner', g.system].filter(Boolean).join(' · ')));
  const n = g.scans.length;
  sum.append(el('span', 'intel-group-meta',
    `${n} scan${n > 1 ? 's' : ''} · latest ${new Date(g.latest).toLocaleDateString()} · ${g.contributors.join(', ')}`));
  box.append(sum);

  box.append(el('div', 'intel-group-fleet', `Latest fleet: ${fleetText(g.scans[0].fleet)}`));
  for (const scan of g.scans.slice(0, PER_PAGE)) box.append(renderScan(scan, freighterCapacity));
  if (g.scans.length > PER_PAGE) {
    box.append(el('div', 'intel-more', `${g.scans.length - PER_PAGE} older scan(s) not shown.`));
  }
  return box;
}

let sharedOnly = false;
let selectedPlayer = null;   // null = all players
let wired = false;

export const ALL_PLAYERS = 'All players';

function renderPlayers(players, groupsAll) {
  const host = document.getElementById('intel-players');
  host.textContent = '';
  host.append(el('div', 'intel-players-label', 'Players'));

  const mk = (name, planets, scans, active) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `intel-player${active ? ' active' : ''}`;
    btn.append(el('span', null, name));
    btn.append(el('span', 'intel-player-count',
      planets == null ? `${fmt(scans)}` : `${planets}p · ${scans}s`));
    btn.title = planets == null
      ? `${scans} scan(s) across every player`
      : `${planets} planet(s), ${scans} scan(s)`;
    btn.onclick = () => {
      selectedPlayer = name === ALL_PLAYERS ? null : name;
      renderIntelTab();
    };
    return btn;
  };

  host.append(mk(ALL_PLAYERS, null,
    groupsAll.reduce((s, g) => s + g.scans.length, 0), selectedPlayer === null));
  for (const p of players) host.append(mk(p.name, p.planets, p.scans, selectedPlayer === p.name));
  if (!players.length) host.append(el('div', 'intel-none', 'No players yet.'));
}

// Ship defs give three things this tab needs: freighter capacity for the loot
// sub-line, ship art for the fleet rows, and — via the art path — our race,
// which is the only way to build building/defense image URLs. They come from the
// background over a message, so fetch once and re-render when they land rather
// than blocking the first paint.
let freighterCapacity = null;
let shipsByKey = {};
let shipsById = {};
let gameRace = null;
let shipDefsPending = false;

// Ship art lives at /api/images/ships/{race}/{key}.webp, so the race we need for
// building art is already sitting in any ship's imageUrl.
export function raceFromImageUrl(url) {
  const m = /\/images\/ships\/([^/]+)\//.exec(url || '');
  return m ? m[1] : null;
}

function ensureShipDefs() {
  if (shipDefsPending) return;
  shipDefsPending = true;
  browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' }).then(res => {
    const ships = (res && res.ships) || [];
    if (!ships.length) return;
    shipsByKey = Object.fromEntries(ships.filter(s => s.key).map(s => [s.key, s]));
    shipsById = Object.fromEntries(ships.map(s => [s.shipDefId, s]));
    gameRace = raceFromImageUrl(ships.find(s => s.imageUrl)?.imageUrl);
    const freighter = shipsByKey.freighter;
    if (freighter && freighter.cargoCapacity) freighterCapacity = freighter.cargoCapacity;
    renderIntelTab();
  }).catch(() => { /* icons and the freighter figure are simply omitted */ });
}

export function renderIntelTab() {
  if (!wired) {
    const chk = document.getElementById('intel-shared-only');
    chk.addEventListener('change', () => { sharedOnly = chk.checked; renderIntelTab(); });
    wired = true;
  }
  ensureShipDefs();

  const reports = store.spy_reports || [];
  // The counts that used to be five stat cards now ride along the sharing
  // panel's header — same information, none of the vertical space.
  const s = intelSummary(reports);
  document.getElementById('intel-summary').textContent = s.total
    ? `${fmt(s.total)} report${s.total > 1 ? 's' : ''} · ${fmt(s.shared)} from ${fmt(s.contributors)} all${s.contributors === 1 ? 'y' : 'ies'} · ${fmt(s.targets)} target${s.targets > 1 ? 's' : ''}`
    : 'nothing shared yet';

  const host = document.getElementById('intel-groups');
  host.textContent = '';
  const groupsAll = groupByTarget(reports, sharedOnly);

  // A player selected before a filter change can vanish from the pool — fall
  // back to "all" rather than rendering an empty list with no way back.
  const players = playerList(reports, sharedOnly);
  if (selectedPlayer && !players.some(p => p.name === selectedPlayer)) selectedPlayer = null;
  renderPlayers(players, groupsAll);

  const groups = selectedPlayer
    ? groupsAll.filter(g => ownerOf(g.scans[0]) === selectedPlayer)
    : groupsAll;
  if (!groups.length) {
    host.append(el('div', 'intel-none', selectedPlayer
      ? `No intel on ${selectedPlayer} matching the current filter.`
      : sharedOnly
        ? 'No intel shared by allies yet — ask someone to hit "Share spy intel", then Sync.'
        : 'No spy reports yet. Scan a target, or Sync to pull what your alliance shared.'));
    return;
  }
  groups.forEach((g, i) => {
    const box = renderGroup(g, freighterCapacity);
    if (i === 0) box.open = true;
    host.append(box);
  });
}
