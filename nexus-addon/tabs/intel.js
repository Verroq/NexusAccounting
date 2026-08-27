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

import { PER_PAGE, RESOURCE_SERIES, fmt, makeStatCard, store } from '../common.js';

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

// Defences split: the shield generator is the one that gates whether an attack
// lands at all, so it is called out rather than buried in the turret list.
export const SHIELD_KEYS = new Set(['shield_generator', 'planetary_shield']);

export function splitDefenses(defense) {
  const all = Array.isArray(defense) ? defense : (defense ? [defense] : []);
  const rows = all.filter(d => d && (d.key || d.name));
  return {
    shield: rows.filter(d => SHIELD_KEYS.has(d.key)),
    turrets: rows.filter(d => !SHIELD_KEYS.has(d.key)).sort((a, b) => (b.level || 0) - (a.level || 0)),
  };
}

// Short fleet summary for the collapsed group header.
export function fleetText(fleet = []) {
  if (!fleet.length) return '—';
  const sorted = [...fleet].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
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

// ── Render ─────────────────────────────────────────────────────────────────

const CHIP = 'display:inline-flex;gap:5px;align-items:baseline;padding:2px 8px;border-radius:6px;' +
  'background:var(--color-surface);border:1px solid var(--color-divider);font-size:0.8rem;white-space:nowrap';
const BLOCK_LABEL = 'color:var(--color-muted);font-size:0.72rem;text-transform:uppercase;' +
  'letter-spacing:0.04em;margin:10px 0 4px';

function chipRow(items, colorFor) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  if (!items.length) {
    const none = document.createElement('span');
    none.style.cssText = 'color:var(--color-muted);font-size:0.8rem';
    none.textContent = 'none reported';
    wrap.append(none);
    return wrap;
  }
  for (const it of items) {
    const chip = document.createElement('span');
    chip.style.cssText = CHIP;
    const label = document.createElement('span');
    label.textContent = it.label;
    const value = document.createElement('strong');
    value.textContent = it.value;
    const c = colorFor ? colorFor(it) : null;
    if (c) value.style.color = c;
    chip.append(label, value);
    wrap.append(chip);
  }
  return wrap;
}

function block(parent, label, node) {
  const h = document.createElement('div');
  h.style.cssText = BLOCK_LABEL;
  h.textContent = label;
  parent.append(h, node);
}

// One scan: everything the report carries — resources, shield, planetary
// defences, buildings, fleet.
function renderScan(scan) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:10px 0;border-top:1px solid var(--color-divider)';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:baseline';
  const when = document.createElement('strong');
  when.textContent = scan.created_at ? new Date(scan.created_at).toLocaleString() : 'unknown date';
  const by = document.createElement('span');
  by.style.cssText = 'font-size:0.8rem';
  by.textContent = `scanned by ${scan.contributor}`;
  if (scan.shared_by) by.style.color = 'var(--color-accent)';
  else by.style.color = 'var(--color-muted)';
  head.append(when, by);
  if (scan.outcome) {
    const outcome = document.createElement('span');
    outcome.style.cssText = 'font-size:0.8rem;color:var(--color-muted)';
    outcome.textContent = `· ${scan.outcome}`;
    head.append(outcome);
  }
  const tier = (scan.resources || {}).tier;
  if (tier) {
    const t = document.createElement('span');
    t.style.cssText = 'font-size:0.8rem;color:var(--color-muted)';
    t.textContent = `· resources: ${tier}`;
    head.append(t);
  }
  wrap.append(head);

  const res = resourceEntries(scan.resources);
  block(wrap, 'Resources', chipRow(
    res.map(r => ({ label: r.label, value: fmt(r.value), key: r.key })),
    it => (RES_META[snake(it.key)] || {}).color,
  ));

  const { shield, turrets } = splitDefenses(scan.defense);
  block(wrap, 'Shield', chipRow(shield.map(d => ({ label: d.name || d.key, value: `L${d.level ?? '?'}` }))));
  block(wrap, 'Planetary defenses', chipRow(turrets.map(d => ({ label: d.name || d.key, value: `L${d.level ?? '?'}` }))));

  const buildings = [...(scan.buildings || [])].sort((a, b) => (b.level || 0) - (a.level || 0));
  block(wrap, `Buildings (${buildings.length})`,
    chipRow(buildings.map(b => ({ label: b.name || b.key, value: `L${b.level ?? '?'}` }))));

  const fleet = [...(scan.fleet || [])].sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
  block(wrap, 'Fleet',
    chipRow(fleet.map(f => ({ label: f.name || f.key, value: fmt(f.quantity || 0) }))));

  return wrap;
}

function renderGroup(g) {
  const box = document.createElement('details');
  box.className = 'reports-section';
  box.style.cssText = 'padding:12px 14px';

  const sum = document.createElement('summary');
  sum.style.cssText = 'cursor:pointer;display:flex;flex-wrap:wrap;gap:10px;align-items:baseline';
  const title = document.createElement('strong');
  title.textContent = g.target_name;
  const owner = document.createElement('span');
  owner.style.cssText = 'color:var(--color-muted);font-size:0.85rem';
  owner.textContent = [g.target_user || 'unknown owner', g.system].filter(Boolean).join(' · ');
  const meta = document.createElement('span');
  meta.style.cssText = 'margin-left:auto;color:var(--color-muted);font-size:0.8rem';
  const n = g.scans.length;
  meta.textContent = `${n} scan${n > 1 ? 's' : ''} · latest ${new Date(g.latest).toLocaleDateString()} · ${g.contributors.join(', ')}`;
  sum.append(title, owner, meta);
  box.append(sum);

  // The newest scan is the current picture, so open the first group by default
  // and leave the fleet line visible even while collapsed.
  const latestFleet = document.createElement('div');
  latestFleet.style.cssText = 'color:var(--color-muted);font-size:0.8rem;margin-top:6px';
  latestFleet.textContent = `Latest fleet: ${fleetText(g.scans[0].fleet)}`;
  box.append(latestFleet);

  for (const scan of g.scans.slice(0, PER_PAGE)) box.append(renderScan(scan));
  if (g.scans.length > PER_PAGE) {
    const more = document.createElement('div');
    more.style.cssText = 'color:var(--color-muted);font-size:0.8rem;padding-top:8px';
    more.textContent = `${g.scans.length - PER_PAGE} older scan(s) not shown.`;
    box.append(more);
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
  const label = document.createElement('div');
  label.style.cssText = BLOCK_LABEL + ';margin-top:0';
  label.textContent = 'Players';
  host.append(label);

  const mk = (name, planets, scans, active) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `intel-player${active ? ' active' : ''}`;
    const n = document.createElement('span');
    n.textContent = name;
    const c = document.createElement('span');
    c.className = 'intel-player-count';
    c.textContent = planets == null ? `${scans}` : `${planets}p · ${scans}s`;
    btn.title = planets == null
      ? `${scans} scan(s) across every player`
      : `${planets} planet(s), ${scans} scan(s)`;
    btn.append(n, c);
    btn.onclick = () => {
      selectedPlayer = name === ALL_PLAYERS ? null : name;
      renderIntelTab();
    };
    return btn;
  };

  host.append(mk(ALL_PLAYERS, null,
    groupsAll.reduce((s, g) => s + g.scans.length, 0), selectedPlayer === null));
  for (const p of players) host.append(mk(p.name, p.planets, p.scans, selectedPlayer === p.name));

  if (!players.length) {
    const none = document.createElement('div');
    none.style.cssText = 'color:var(--color-muted);font-size:0.8rem;padding:6px 10px';
    none.textContent = 'No players yet.';
    host.append(none);
  }
}

export function renderIntelTab() {
  if (!wired) {
    const chk = document.getElementById('intel-shared-only');
    chk.addEventListener('change', () => { sharedOnly = chk.checked; renderIntelTab(); });
    wired = true;
  }

  const reports = store.spy_reports || [];
  const s = intelSummary(reports);
  const stats = document.getElementById('intel-stats');
  stats.textContent = '';
  stats.append(
    makeStatCard('Reports', fmt(s.total), 'missions'),
    makeStatCard('From allies', fmt(s.shared), 'missions'),
    makeStatCard('Your own', fmt(s.own), 'missions'),
    makeStatCard('Contributors', fmt(s.contributors), 'missions'),
    makeStatCard('Targets', fmt(s.targets), 'missions'),
  );

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
    const empty = document.createElement('div');
    empty.style.cssText = 'color:var(--color-muted);padding:12px 0';
    empty.textContent = selectedPlayer
      ? `No intel on ${selectedPlayer} matching the current filter.`
      : sharedOnly
        ? 'No intel shared by allies yet — ask someone to hit "Share spy intel", then Sync.'
        : 'No spy reports yet. Scan a target, or Sync to pull what your alliance shared.';
    host.append(empty);
    return;
  }
  groups.forEach((g, i) => {
    const el = renderGroup(g);
    if (i === 0) el.open = true;
    host.append(el);
  });
}
