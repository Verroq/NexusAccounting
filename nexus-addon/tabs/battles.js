// Battles tab — unified view of every combat across sources (pirate camps,
// mining pirate-raids, survey ambushes, expedition/wormhole encounters).
// Render-only: it merges the per-type recent records already in `store`, so
// there is no extra background aggregation or storage. Span = recent records.

import { PER_PAGE, fmt, makeStatCard, store, zoneCell } from '../common.js';

const battleSort = { key: 'created_at', dir: -1 };
let battleFilter = 'all';
let battlePage = 1;
const expanded = new Set();

// Ship name → image URL, lazy-loaded once from the shipyard defs so expanded
// rows can show a ship icon next to each name. Resolved by name because stored
// rounds keep only names, not keys.
let shipImgByName = null;
async function loadShipImages() {
  if (shipImgByName !== null) return;
  shipImgByName = {};   // set before await so we only fetch once
  try {
    const defs = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
    for (const s of (defs.ships || [])) if (s.name && s.imageUrl) shipImgByName[s.name] = s.imageUrl;
    if (document.getElementById('battles-content')) renderBattlesTab();
  } catch { /* no login / offline — names render without icons */ }
}
// <img> HTML for a ship name, or '' when unknown. Trusted game CDN URL.
function imgHtml(name) {
  const url = shipImgByName && shipImgByName[name];
  return url ? `<img src="${url}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:3px">` : '';
}

// shipDefId→qty detail → [{ name, qty }] using the ship catalog.
function detailToNames(detail) {
  return Object.entries(detail || {}).map(([id, qty]) => ({
    name: (store.ships?.[id] || {}).name || `#${id}`, qty,
  }));
}
// [{ key, quantity }] fleet → [{ name, qty }] via a key→def index.
function fleetToNames(fleet, byKey) {
  return (fleet || []).map(f => ({ name: f.name || (byKey[f.key] || {}).name || f.key, qty: f.quantity || 1 }));
}
// Expedition/wormhole loss array is either { shipDefId, quantity } or { key, lost }.
function rawLossToNames(arr, byKey) {
  return (arr || []).map(i => ({
    name: i.shipDefId != null ? ((store.ships?.[i.shipDefId] || {}).name || `#${i.shipDefId}`)
                              : ((byKey[i.key] || {}).name || i.key),
    qty: i.quantity ?? i.lost ?? 0,
  }));
}

// Collect + normalize every combat record from the four sources.
function collectBattles() {
  const byKey = {};
  for (const s of Object.values(store.ships || {})) if (s && s.key) byKey[s.key] = s;
  const rows = [];

  for (const r of (store.pirate_recent_reports || [])) {
    rows.push({
      key: `pirate:${r.id}`, created_at: r.created_at, source: 'Pirate camp',
      location: r.camp_id != null ? `Camp #${r.camp_id}` : '—', zone: r.zone, outcome: r.outcome || '—',
      lost: r.ships_lost || 0, damaged: r.ships_damaged || 0, killed: r.pirates_destroyed ?? null,
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.attacker_fleet, byKey), enemyFleet: fleetToNames(r.pirate_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: detailToNames(r.ships_damaged_detail),
      rounds: r.rounds || [],
    });
  }
  for (const r of (store.mining_recent_reports || [])) {
    if (!r.combat_outcome) continue;   // only mining deliveries that got raided
    rows.push({
      key: `mining:${r.id}`, created_at: r.created_at, source: 'Mining raid',
      location: r.location || r.planet || '—', zone: r.zone, outcome: r.combat_outcome,
      lost: r.ships_lost || 0, damaged: 0, killed: null, youAttacker: false,   // a raid: you defend
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.your_fleet, byKey), enemyFleet: fleetToNames(r.enemy_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: [],
      rounds: r.rounds || [],
    });
  }
  for (const r of (store.recent_reports || [])) {
    if (!(r.combat_outcome || r.ships_lost || r.ships_damaged)) continue;   // a survey counts as a battle if it fought
    rows.push({
      key: `survey:${r.id}`, created_at: r.created_at, source: 'Survey battle',
      location: r.system_name || '—', zone: r.zone, outcome: r.combat_outcome || 'ambush',
      lost: r.ships_lost || 0, damaged: r.ships_damaged || 0, killed: null,
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.your_fleet, byKey), enemyFleet: fleetToNames(r.enemy_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: detailToNames(r.ships_damaged_detail),
      rounds: r.rounds || [],
    });
  }
  for (const r of (store.exp_recent_reports || [])) {
    if (!r.ships_lost) continue;   // only encounters that cost ships
    rows.push({
      key: `exp:${r.id}`, created_at: r.created_at, source: r.kind === 'wormhole' ? 'Wormhole' : 'Expedition',
      location: r.location || '—', zone: r.zone, outcome: r.event || '—',
      lost: r.ships_lost || 0, damaged: 0, killed: null, debris: null,
      yourFleet: null, enemyFleet: null,
      lostDetail: rawLossToNames(r.ships_destroyed_raw, byKey), damagedDetail: [],
      rounds: [],
    });
  }
  return rows;
}

const OUTCOME_WIN = /won|win|victor|success|defender|survi/i;
const OUTCOME_LOSS = /lost|loss|defeat|destroy|attacker|fail/i;
function outcomeColor(o) {
  if (OUTCOME_WIN.test(o)) return '#56d364';
  if (OUTCOME_LOSS.test(o)) return '#ff7b72';
  return '#8b949e';
}

function sortRows(rows) {
  const { key, dir } = battleSort;
  return rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    let c;
    if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
    else c = String(av).localeCompare(String(bv));
    if (c === 0) c = String(a.created_at).localeCompare(String(b.created_at));
    return c * dir;
  });
}

function numTd(v) {
  const td = document.createElement('td');
  if (v) td.textContent = v.toLocaleString();
  else { const s = document.createElement('span'); s.className = 'zero'; s.textContent = '—'; td.appendChild(s); }
  return td;
}
function shipHtml(x) { return `${imgHtml(x.name)}${x.qty}× ${x.name}`; }
function fleetLine(label, list) {
  const items = (list || []).filter(x => x.qty);
  if (!items.length) return null;
  const div = document.createElement('div');
  div.style.cssText = 'margin:2px 0';
  div.innerHTML = `<span style="color:#8b949e">${label}: </span>` + items.map(shipHtml).join(', ');
  return div;
}
const killList = ks => (ks || []).filter(k => k.qty).map(shipHtml).join(', ') || '—';
// Round-by-round combat table. `youAttacker` picks which combat side is you —
// true for survey/pirate (you attack), false for a mining raid (you defend).
function roundsBlock(rounds, youAttacker = true) {
  if (!rounds || !rounds.length) return null;
  const you = youAttacker ? 'atk' : 'def';
  const foe = youAttacker ? 'def' : 'atk';
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;margin:4px 0 8px';
  table.innerHTML = `<thead><tr style="text-align:left;color:#8b949e;font-size:0.78rem">
    <th style="padding:2px 6px">#</th>
    <th style="padding:2px 6px">Your dmg / kills</th>
    <th style="padding:2px 6px">Enemy dmg / kills</th>
    <th style="padding:2px 6px;text-align:right">HP you / enemy</th></tr></thead>`;
  const tb = document.createElement('tbody');
  for (const rd of rounds) {
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid #21262d';
    const td = (html, extra = '') => { const c = document.createElement('td'); c.style.cssText = `padding:2px 6px;${extra}`; c.innerHTML = html; return c; };
    tr.append(
      td(String(rd.round)),
      td(`${(rd[you + '_dmg'] || 0).toLocaleString()} <span style="color:#8b949e">·</span> <span style="color:#56d364">${killList(rd[you + '_killed'])}</span>`),
      td(`${(rd[foe + '_dmg'] || 0).toLocaleString()} <span style="color:#8b949e">·</span> <span style="color:#ff7b72">${killList(rd[foe + '_killed'])}</span>`),
      td(`${rd[you + '_hp'] ?? '?'}% / ${rd[foe + '_hp'] ?? '?'}%`, 'text-align:right'),
    );
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  return table;
}

export function renderBattlesTab() {
  const root = document.getElementById('battles-content');
  root.textContent = '';
  loadShipImages();   // lazy, re-renders once images are ready

  const rows = collectBattles();

  // Summary cards (all sources, unfiltered).
  const cards = document.createElement('div');
  cards.className = 'stats';
  cards.append(
    makeStatCard('Battles', fmt(rows.length), 'missions'),
    makeStatCard('Ships lost', fmt(rows.reduce((s, r) => s + r.lost, 0)), '', 'color:#ff7b72'),
    makeStatCard('Ships damaged', fmt(rows.reduce((s, r) => s + r.damaged, 0)), '', 'color:#e3b341'),
    makeStatCard('Enemies destroyed', fmt(rows.reduce((s, r) => s + (r.killed || 0), 0)), '', 'color:#56d364'),
  );
  const label = document.createElement('div');
  label.className = 'section-label'; label.textContent = 'All combat (recent records)';
  root.append(label, cards);

  // Source filter.
  const sources = ['all', ...new Set(rows.map(r => r.source))];
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0';
  const flt = document.createElement('span'); flt.style.color = '#8b949e'; flt.textContent = 'Source:';
  const sel = document.createElement('select');
  sel.style.cssText = 'background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:4px 8px;border-radius:6px';
  for (const s of sources) {
    const o = document.createElement('option'); o.value = s; o.textContent = s === 'all' ? 'All' : s;
    if (s === battleFilter) o.selected = true; sel.appendChild(o);
  }
  sel.addEventListener('change', () => { battleFilter = sel.value; battlePage = 1; renderBattlesTab(); });
  bar.append(flt, sel);
  root.append(bar);

  // Table.
  const filtered = battleFilter === 'all' ? rows : rows.filter(r => r.source === battleFilter);
  const sorted = sortRows(filtered);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  if (battlePage > totalPages) battlePage = totalPages;
  const slice = sorted.slice((battlePage - 1) * PER_PAGE, battlePage * PER_PAGE);

  const cols = [
    ['created_at', 'Date'], ['source', 'Source'], ['location', 'Location'], ['zone', 'Zone'],
    ['outcome', 'Outcome'], ['lost', 'Lost'], ['damaged', 'Damaged'], ['killed', 'Enemy killed'], ['debris', 'Debris'],
  ];
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  for (const [k, lbl] of cols) {
    const th = document.createElement('th');
    th.textContent = lbl + (battleSort.key === k ? (battleSort.dir === -1 ? ' ▼' : ' ▲') : '');
    th.style.cssText = 'cursor:pointer;text-align:left';
    th.addEventListener('click', () => {
      battleSort.dir = battleSort.key === k ? -battleSort.dir : -1;
      battleSort.key = k; renderBattlesTab();
    });
    htr.appendChild(th);
  }
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const r of slice) {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const tdDate = document.createElement('td'); tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdSrc = document.createElement('td'); tdSrc.textContent = r.source;
    const tdLoc = document.createElement('td'); tdLoc.textContent = r.location;
    const tdOut = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'badge';
    badge.textContent = String(r.outcome).replace(/_/g, ' '); badge.style.color = outcomeColor(r.outcome);
    tdOut.appendChild(badge);
    tr.append(tdDate, tdSrc, tdLoc, zoneCell(r.zone), tdOut,
      numTd(r.lost), numTd(r.damaged),
      r.killed == null ? numTd(0) : numTd(r.killed),
      r.debris == null ? numTd(0) : numTd(r.debris));
    tr.addEventListener('click', () => {
      if (expanded.has(r.key)) expanded.delete(r.key); else expanded.add(r.key);
      renderBattlesTab();
    });
    tbody.appendChild(tr);

    if (expanded.has(r.key)) {
      const dtr = document.createElement('tr');
      const dtd = document.createElement('td'); dtd.colSpan = cols.length;
      dtd.style.cssText = 'background:#0d1117;padding:8px 14px;font-size:0.85rem';
      const lines = [
        fleetLine('Your fleet', r.yourFleet),
        fleetLine('Enemy fleet', r.enemyFleet),
        fleetLine('Ships lost', r.lostDetail),
        fleetLine('Ships damaged', r.damagedDetail),
      ].filter(Boolean);
      lines.forEach(l => dtd.appendChild(l));
      const rb = roundsBlock(r.rounds, r.youAttacker !== false);
      if (rb) dtd.appendChild(rb);
      if (!lines.length && !rb) { const p = document.createElement('div'); p.style.color = '#484f58'; p.textContent = 'No combat detail recorded for this battle.'; dtd.appendChild(p); }
      dtr.appendChild(dtd); tbody.appendChild(dtr);
    }
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'reports-section';
  const header = document.createElement('div');
  header.className = 'reports-header';
  const h2 = document.createElement('h2'); h2.textContent = 'Recent battles';
  const pg = document.createElement('div'); pg.className = 'pagination';
  const prev = document.createElement('button'); prev.textContent = '← Prev'; prev.disabled = battlePage <= 1;
  const info = document.createElement('span'); info.textContent = `Page ${battlePage} / ${totalPages} (${sorted.length} total)`;
  const next = document.createElement('button'); next.textContent = 'Next →'; next.disabled = battlePage >= totalPages;
  prev.addEventListener('click', () => { battlePage--; renderBattlesTab(); });
  next.addEventListener('click', () => { battlePage++; renderBattlesTab(); });
  pg.append(prev, info, next); header.append(h2, pg);
  wrap.append(header, table);

  if (!rows.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No battles recorded yet — click Scrape Now after a fight.';
    root.appendChild(p);
  } else {
    root.appendChild(wrap);
  }
}
