// Shared state and helpers used by every dashboard tab.
// Loaded first — all other dashboard scripts depend on it.

export let store = {};   // full storage snapshot
export function setStore(s) { store = s; }   // setter: other modules can't reassign an import

export let activeTab = 'global';
export function setActiveTab(t) { activeTab = t; }

export const PER_PAGE = 20;

// shipDefId → def ({ name, imageUrl, … }), fetched once and cached.
let _shipDefs = null;
async function shipDefs() {
  if (!_shipDefs) {
    const res = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
    _shipDefs = {};
    for (const s of (res.ships || [])) _shipDefs[s.shipDefId] = s;
  }
  return _shipDefs;
}
export async function shipName(id) {
  return (await shipDefs())[id]?.name || `#${id}`;
}

// In-page replacement for window.confirm(). Native confirm() is silently
// suppressed once a user ticks Firefox's "prevent additional dialogs" box,
// which permanently blocks fleet/research launches. This never triggers that.
// Optional `ships` = [{ shipDefId, quantity }] renders an image+name chip row.
export async function confirmDialog(message, ships) {
  const defs = ships?.length ? await shipDefs() : null;
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:420px;padding:20px;font:14px/1.5 system-ui,sans-serif;white-space:pre-line';
    const msg = document.createElement('div');
    // Render per line so a ⚠ warning (e.g. not enough ships to fill the template)
    // stands out in red.
    for (const line of String(message).split('\n')) {
      const l = document.createElement('div');
      l.textContent = line;
      if (line.trim().startsWith('⚠')) l.style.color = '#ff7b72';
      msg.appendChild(l);
    }
    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end;white-space:normal';
    const mk = (label, primary) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = `padding:7px 16px;border-radius:6px;border:1px solid #39405a;cursor:pointer;${primary ? 'background:#3b82f6;color:#fff;border-color:#3b82f6' : 'background:#2a3146;color:#e6e8ee'}`;
      return b;
    };
    const cancel = mk('Cancel', false);
    const ok = mk('Confirm', true);
    const done = (v) => { ov.remove(); resolve(v); };
    cancel.onclick = () => done(false);
    ok.onclick = () => done(true);
    ov.onclick = (e) => { if (e.target === ov) done(false); };
    box.append(msg);
    if (defs) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-top:10px;display:flex;flex-wrap:wrap;gap:12px;white-space:normal';
      for (const s of ships) {
        const def = defs[s.shipDefId] || {};
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
        if (def.imageUrl) {
          const img = document.createElement('img');
          img.src = def.imageUrl;
          img.style.cssText = 'width:24px;height:24px;object-fit:contain';
          chip.append(img);
        }
        chip.append(document.createTextNode(`${s.quantity}× ${def.name || '#' + s.shipDefId}`));
        row.append(chip);
      }
      box.append(row);
    }
    btns.append(cancel, ok);
    box.append(btns);
    ov.append(box);
    document.body.append(ov);
    ok.focus();
  });
}

// Editable fleet dialog — the launch-time fleet editor (mirrors the live-search
// panel's editor). Rows = union of seeded ships and ships available on the
// source planet; each quantity is capped to availability. `seed` is
// {shipDefId → wanted qty}, `avail` is {shipDefId → count on planet}. Resolves
// to [{shipDefId, quantity}] on confirm (send once), or null on cancel.
export async function editFleetDialog({ title, subtitle = '', avail = {}, seed = {}, nonOptimisedIds = [] }) {
  const defs = await shipDefs();
  const ids = [...new Set([
    ...Object.keys(seed).map(Number),
    ...Object.keys(avail).map(Number).filter(id => (avail[id] || 0) > 0),
  ])];
  const state = new Map();
  for (const id of ids) {
    const q = Math.min(seed[id] || 0, avail[id] || 0);
    if (q > 0) state.set(id, q);
  }
  const effective = () => [...state.entries()]
    .map(([id, q]) => ({ shipDefId: id, quantity: Math.min(q, avail[id] || 0) }))
    .filter(s => s.quantity > 0);

  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:420px;width:90%;padding:20px;font:14px/1.5 system-ui,sans-serif';
    const h = document.createElement('div');
    h.textContent = title || 'Edit fleet';
    h.style.cssText = 'font-weight:600;margin-bottom:2px';
    box.append(h);
    if (subtitle) {
      const sub = document.createElement('div');
      sub.textContent = subtitle;
      sub.style.cssText = 'color:#8b949e;font-size:0.85rem;margin-bottom:8px;white-space:pre-line';
      box.append(sub);
    }

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:240px;overflow:auto;margin-top:8px';
    if (!ids.length) {
      rows.textContent = 'No ships available on the source planet.';
      rows.style.color = '#8b949e';
    }
    const ok = document.createElement('button');   // declared early for refresh()
    const refresh = () => { ok.disabled = !effective().length; ok.style.opacity = ok.disabled ? '0.5' : '1'; };
    for (const id of ids) {
      const def = defs[id] || {};
      const max = avail[id] || 0;
      const line = document.createElement('div');
      line.style.cssText = 'display:grid;grid-template-columns:24px 1fr 64px 44px;align-items:center;gap:8px';
      const iconCell = document.createElement('span');
      if (def.imageUrl) {
        const img = document.createElement('img');
        img.src = def.imageUrl; img.style.cssText = 'width:22px;height:22px;object-fit:contain;display:block';
        iconCell.append(img);
      }
      const name = document.createElement('span');
      name.textContent = def.name || `#${id}`;
      name.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = '0'; inp.max = String(max); inp.value = String(state.get(id) || 0);
      inp.style.cssText = 'width:100%;background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:3px 6px;border-radius:6px;font-size:0.85rem;box-sizing:border-box';
      inp.addEventListener('change', () => {
        let v = parseInt(inp.value, 10); if (isNaN(v) || v < 0) v = 0;
        if (v > max) v = max;
        inp.value = String(v);
        if (v > 0) state.set(id, v); else state.delete(id);
        refresh();
      });
      const avLbl = document.createElement('span');
      avLbl.textContent = `/ ${max}`; avLbl.style.color = '#8b949e';
      line.append(iconCell, name, inp, avLbl);
      rows.append(line);
    }
    box.append(rows);

    const btns = document.createElement('div');
    btns.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end';
    const mk = (b, label, primary) => {
      b.textContent = label;
      b.style.cssText = `padding:7px 16px;border-radius:6px;border:1px solid #39405a;cursor:pointer;${primary ? 'background:#238636;color:#fff;border-color:#2ea043' : 'background:#2a3146;color:#e6e8ee'}`;
      return b;
    };
    const cancel = mk(document.createElement('button'), 'Cancel', false);
    mk(ok, 'Send', true);
    const done = (v) => { ov.remove(); resolve(v); };
    cancel.onclick = () => done(null);
    ok.onclick = () => done(effective());
    ov.onclick = (e) => { if (e.target === ov) done(null); };
    refresh();
    btns.append(cancel);
    // Escape hatch: send all available units of the recommended ship(s), above
    // the optimal count. Shown only when there are extra units to send.
    const maxIds = nonOptimisedIds.filter(id => (avail[id] || 0) > (state.get(id) || 0));
    if (maxIds.length) {
      const alt = document.createElement('button');
      alt.textContent = 'Send non-optimised fleet';
      alt.title = 'Send all available units of the recommended ship, more than needed';
      alt.style.cssText = 'padding:7px 16px;border-radius:6px;border:1px solid #db6d28;background:#bd561d;color:#fff;cursor:pointer';
      alt.onclick = () => { for (const id of maxIds) state.set(id, avail[id] || 0); done(effective()); };
      btns.append(alt);
    }
    btns.append(ok);
    box.append(btns);
    ov.append(box);
    document.body.append(ov);
  });
}

// Minimal Markdown → DOM for the changelog: ### headings, - bullets (with
// wrapped continuation lines), **bold**, *italic*, `code`. Returns a fragment.
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  let ul = null, li = null;
  const closeList = () => { ul = null; li = null; };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      closeList();
      const el = document.createElement('h4');
      el.style.cssText = 'margin:14px 0 6px;font-size:0.95rem';
      inlineMd(el, h[1]);
      frag.append(el);
    } else if (/^[-*]\s+/.test(line)) {
      if (!ul) { ul = document.createElement('ul'); ul.style.cssText = 'margin:0 0 4px 18px;padding:0'; frag.append(ul); }
      li = document.createElement('li');
      li.style.cssText = 'margin:2px 0';
      inlineMd(li, line.replace(/^[-*]\s+/, ''));
      ul.append(li);
    } else if (li) {                       // wrapped continuation of a bullet
      li.append(document.createTextNode(' '));
      inlineMd(li, line.trim());
    } else {
      const p = document.createElement('div');
      inlineMd(p, line.trim());
      frag.append(p);
    }
  }
  return frag;
}

function inlineMd(parent, text) {
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
    const el = document.createElement(m[1] != null ? 'strong' : m[2] != null ? 'em' : 'code');
    el.textContent = m[1] ?? m[2] ?? m[3];
    parent.append(el);
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}

// One-button info modal (e.g. "What's new"). `body` may be a string (plain
// text) or a DOM node (e.g. from renderMarkdown).
export function infoDialog(title, body) {
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText = 'background:#1b2030;color:#e6e8ee;border:1px solid #39405a;border-radius:8px;max-width:480px;max-height:70vh;overflow:auto;padding:20px;font:14px/1.5 system-ui,sans-serif';
  const h = document.createElement('h3');
  h.textContent = title;
  h.style.cssText = 'margin:0 0 12px';
  const msg = document.createElement('div');
  if (body instanceof Node) msg.append(body);
  else { msg.textContent = body; msg.style.cssText = 'white-space:pre-wrap'; }
  const btns = document.createElement('div');
  btns.style.cssText = 'margin-top:18px;display:flex;justify-content:flex-end';
  const ok = document.createElement('button');
  ok.textContent = 'Got it';
  ok.style.cssText = 'padding:7px 16px;border-radius:6px;border:1px solid #3b82f6;background:#3b82f6;color:#fff;cursor:pointer';
  ok.onclick = () => ov.remove();
  ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
  btns.append(ok);
  box.append(h, msg, btns);
  ov.append(box);
  document.body.append(ov);
  ok.focus();
}

// Fuel estimate, cached per source+destination+ships so a known route with the
// selected template never re-hits the API. Errors aren't cached (so they retry).
const _fuelCache = new Map();
export async function fuelEstimate(sourcePlanetId, targetSystemId, ships) {
  const sig = ships.map(s => `${s.shipDefId}:${s.quantity}`).sort().join(',');
  const key = `${sourcePlanetId}|${targetSystemId}|${sig}`;
  if (_fuelCache.has(key)) return _fuelCache.get(key);
  const est = await browser.runtime.sendMessage({
    type: 'GET_FUEL_ESTIMATE',
    body: { sourcePlanetId, targetSystemId, ships },
  });
  if (!est.error) _fuelCache.set(key, est);
  return est;
}

// Fill a box with "On this planet:" + a chip (icon + qty × name) per ship that
// has a positive count. `ships` is [{ shipDefId, name, imageUrl }] to consider.
// Clear an availability strip (or show a message) and invalidate its signature,
// so the next renderAvailStrip with the same data still repaints. Callers must
// use this instead of box.textContent='' — a raw wipe leaves the cached sig and
// the strip stays blank.
export function clearAvailStrip(box, msg = '') {
  box.textContent = msg;
  delete box.dataset.availSig;
}

export function renderAvailStrip(box, ships, available, emptyMsg) {
  const here = ships.filter(s => (available[s.shipDefId] || 0) > 0);
  // Skip rebuild when nothing changed — avoids the empty-frame flash and the
  // img reload that shifts layout on every poll.
  const sig = here.map(s => `${s.shipDefId}:${available[s.shipDefId] || 0}`).join('|') || emptyMsg;
  if (box.dataset.availSig === sig) return;
  box.dataset.availSig = sig;
  box.textContent = '';
  const label = document.createElement('span');
  label.textContent = here.length ? 'On this planet:' : emptyMsg;
  box.appendChild(label);
  for (const s of here) {
    const chip = document.createElement('span');
    chip.style.cssText = 'display:inline-flex; align-items:center; gap:5px;';
    chip.title = s.name;
    if (s.imageUrl) {
      const img = document.createElement('img');
      img.src = s.imageUrl;
      img.style.cssText = 'width:22px; height:22px; object-fit:contain;';
      chip.appendChild(img);
    }
    chip.append(document.createTextNode(`${(available[s.shipDefId] || 0).toLocaleString()}× ${s.name}`));
    box.appendChild(chip);
  }
}

// Remember template-dropdown choices (by element id) across tabs and sessions.
export async function rememberedSelections() {
  const { template_selections } = await browser.storage.local.get('template_selections');
  return template_selections || {};
}
export async function rememberSelection(id, value) {
  const cur = await rememberedSelections();
  cur[id] = value;
  await browser.storage.local.set({ template_selections: cur });
}

export function fmt(n) {
  return n == null ? '0' : Number(n).toLocaleString();
}

// ── Mode-aware data helpers ────────────────────────────────────────────────

export function getMode() {
  return document.getElementById('mode-select').value; // 'all'|'daily'|'last3'|'last7'|'last30'|'hourly'
}

// Local-time bucket keys. created_at is stored as UTC/server time; bucketing on
// the raw ISO string mis-files reports near local midnight by the UTC offset.
const pad2 = n => String(n).padStart(2, '0');
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function hourKey(ts) {
  const d = new Date(ts);
  return `${dayKey(d)}T${pad2(d.getHours())}:00`;
}
export function bucketKey(ts, byHour) {
  return byHour ? hourKey(ts) : dayKey(ts);
}

// Day range from the Days picker, as { from, to } 'YYYY-MM-DD' ('' = open).
export function getWindowRange() {
  const f = document.getElementById('window-from');
  const t = document.getElementById('window-to');
  return { from: f ? f.value : '', to: t ? t.value : '' };
}

// True when the Days picker has a From and/or To set (a range is in effect).
export function windowActive() {
  const { from, to } = getWindowRange();
  return !!(from || to);
}

// Filter records to the Days picker range (by local day). Open range = all.
export function inWindowRange(records) {
  const { from, to } = getWindowRange();
  if (!from && !to) return records || [];
  return (records || []).filter(r => {
    const day = dayKey(r.created_at);
    return (!from || day >= from) && (!to || day <= to);
  });
}

// Fuel (hydrogen) spent, summed from the per-mission fuel log for a tab type
// ('survey'|'pirate'|'mining'|'debris'|'expedition'|'all'), honouring the
// current View + Zone. Counted per launched fleet, independent of reports.
export function fuelForMode(type, mode) {
  let rows = store.fuel_log || [];
  if (type !== 'all') rows = rows.filter(e => e.type === type);
  rows = filterZone(rows);
  if (mode !== 'all') rows = inWindowRange(rows);
  return rows.reduce((s, e) => s + (e.fuel || 0), 0);
}

// Selected security zone, or 'all'.
export function getZone() {
  const el = document.getElementById('zone-select');
  return el ? el.value : 'all';
}

// Filter records to the selected zone (passthrough when 'all'). Records from
// before zones were tracked have no `zone` → treated as 'unknown'.
export function filterZone(reports) {
  const z = getZone();
  if (z === 'all') return reports || [];
  return (reports || []).filter(r => (r.zone || 'unknown') === z);
}

// True when the precomputed all-time totals can be used as-is (no zone filter).
export function isUnfiltered() {
  return getZone() === 'all';
}

export function getLabelKey(mode) {
  return mode === 'hourly' ? 'hour' : 'day';
}

const shortDate = s => new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export function periodLabelFor(mode) {
  if (mode === 'all') return '';
  const { from, to } = getWindowRange();
  if (!from && !to) return '';
  if (from && to) return from === to ? ` (${shortDate(from)})` : ` (${shortDate(from)}–${shortDate(to)})`;
  return from ? ` (from ${shortDate(from)})` : ` (to ${shortDate(to)})`;
}

// ── Shared per-tab helpers ─────────────────────────────────────────────────
// Every tab follows the same pattern: slice the latest day/hour out of its
// report history, optionally compute an hourly series, and draw the standard
// three-resource line chart. The per-tab code only supplies field getters.

// Records to aggregate for the current mode + zone: zone-filtered all-time for
// 'all' mode, else the zone-filtered records within the Days picker range.
export function recordsForMode(allRecords, mode) {
  const filtered = filterZone(allRecords || []);
  if (mode === 'all' && !windowActive()) return filtered;   // a set range overrides All time
  return inWindowRange(filtered);
}

// Time series grouped by day (all/daily modes) or hour (hourly mode).
// fieldGetters: { field: r => value }.
export function computeSeries(reports, mode, fieldGetters) {
  const byHour = mode === 'hourly';
  const keyName = byHour ? 'hour' : 'day';
  const fields = Object.keys(fieldGetters);
  const map = {};
  for (const r of reports) {
    const k = bucketKey(r.created_at, byHour);
    if (!map[k]) {
      map[k] = { [keyName]: k };
      for (const f of fields) map[k][f] = 0;
    }
    for (const [f, get] of Object.entries(fieldGetters)) map[k][f] += get(r);
  }
  const keys = Object.keys(map).sort();
  if (keys.length < 2) return keys.map(k => map[k]);

  // Fill empty days/hours with zero rows so the time axis stays continuous —
  // otherwise the chart's equal-spaced labels misrepresent gaps in activity.
  // Step in LOCAL calendar units (handles the UTC offset and DST correctly).
  const toDate = k => new Date(byHour ? `${k}:00` : `${k}T00:00:00`);   // local time
  const blank = k => { const o = { [keyName]: k }; for (const f of fields) o[f] = 0; return o; };
  const out = [];
  const endD = toDate(keys[keys.length - 1]);
  let cur = toDate(keys[0]), guard = 0;
  while (cur <= endD && guard++ < 100000) {
    const k = bucketKey(cur, byHour);
    out.push(map[k] || blank(k));
    if (byHour) cur.setHours(cur.getHours() + 1); else cur.setDate(cur.getDate() + 1);
  }
  const { from, to } = getWindowRange();
  if (!from && !to) return out;
  return out.filter(o => {
    const day = String(o[keyName] || '').slice(0, 10);   // 'hour' keys are YYYY-MM-DDTHH:00
    return (!from || day >= from) && (!to || day <= to);
  });
}

export const RESOURCE_SERIES = [
  { field: 'ore',          label: 'Ore',          color: '#f0883e' },
  { field: 'silicates',    label: 'Silicates',    color: '#56d364' },
  { field: 'hydrogen',     label: 'Hydrogen',     color: '#79c0ff' },
  { field: 'alloys',       label: 'Alloys',       color: '#e3b341' },
  { field: 'cryo_ice',     label: 'Cryo-Ice',     color: '#a5d6ff' },
  { field: 'quantum_dust', label: 'Quantum Dust', color: '#bc8cff' },
  { field: 'plasma_core',  label: 'Plasma Core',  color: '#ff7b72' },
  { field: 'dark_matter',  label: 'Dark Matter',  color: '#d2a8ff' },
  { field: 'antimatter',   label: 'Antimatter',   color: '#ffa657' },
];

// fieldGetters covering every chartable resource, for computeSeries.
export const SERIES_GETTERS = {};
for (const d of RESOURCE_SERIES) SERIES_GETTERS[d.field] = r => r[d.field] || 0;

// Resource line chart. Ore/silicates/hydrogen always shown; alloys + exotics
// only when the series actually carries some (avoids a wall of flat-zero lines).
// `count` = { field, label } adds a report-count line on a secondary y-axis.
export function makeResourceLineChart(canvasId, series, labelKey, count) {
  const ALWAYS = new Set(['ore', 'silicates', 'hydrogen']);
  const shown = RESOURCE_SERIES.filter(d =>
    ALWAYS.has(d.field) || series.some(r => (r[d.field] || 0) > 0));
  const datasets = shown.map(d => ({
    label: d.label,
    data: series.map(r => r[d.field] || 0),
    borderColor: d.color,
    backgroundColor: d.color + '22',
    fill: true,
    tension: 0.3,
  }));
  const scales = { ...SCALE_OPTS };
  if (count) {
    datasets.push({
      label: count.label,
      data: series.map(r => r[count.field] || 0),
      borderColor: '#8b949e',
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.3,
      yAxisID: 'count',
    });
    scales.count = {
      position: 'right',
      beginAtZero: true,
      ticks: { color: '#8b949e', precision: 0 },
      grid: { drawOnChartArea: false },
    };
  }
  return new Chart(document.getElementById(canvasId), {
    type: 'line',
    data: { labels: series.map(r => r[labelKey]), datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales,
    },
  });
}

// ── Pure aggregation helpers ───────────────────────────────────────────────

export function computeEventBreakdown(reports) {
  const map = {};
  for (const r of reports) {
    const et = r.event_type || 'unknown';
    if (!map[et]) map[et] = { event_type: et, count: 0, ore: 0, hydrogen: 0, silicates: 0 };
    map[et].count += 1;
    map[et].ore += r.ore || 0;
    map[et].hydrogen += r.hydrogen || 0;
    map[et].silicates += r.silicates || 0;
    for (const k of EXTRA_RES_KEYS_UI) map[et][k] = (map[et][k] || 0) + (r[k] || 0);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

// A damaged ship costs half its build cost to repair.
export const REPAIR_FACTOR = 0.5;

export function emptyResources() {
  return { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {} };
}

// Loss split into full-cost destruction and half-cost repair of damaged ships.
// Returns { destroyed, repair }, each an emptyResources()-shaped object.
export function computeResourcesLost(reports, ships) {
  const out = { destroyed: emptyResources(), repair: emptyResources() };
  const add = (into, detail, factor) => {
    for (const [defId, qty] of Object.entries(detail || {})) {
      const ship = ships[defId];
      if (!ship) continue;
      const q = qty * factor;
      into.ore += q * (ship.costOre || 0);
      into.silicates += q * (ship.costSilicates || 0);
      into.hydrogen += q * (ship.costHydrogen || 0);
      into.alloys += q * (ship.costAlloys || 0);
      for (const [k, v] of Object.entries(ship.rareCosts || {})) {
        into.rare[k] = (into.rare[k] || 0) + q * v;
      }
    }
  };
  for (const r of reports) {
    add(out.destroyed, r.ships_lost_detail, 1);
    add(out.repair, r.ships_damaged_detail, REPAIR_FACTOR);
  }
  return out;
}

// Per-resource destroyed + repair, for net calculations.
export function combinedLost(lost) {
  const d = lost.destroyed || {}, r = lost.repair || {};
  const out = emptyResources();
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) out[k] = (d[k] || 0) + (r[k] || 0);
  for (const src of [d.rare || {}, r.rare || {}]) {
    for (const [k, v] of Object.entries(src)) out.rare[k] = (out.rare[k] || 0) + v;
  }
  return out;
}

// ── Stat cards ─────────────────────────────────────────────────────────────

export function makeStatCard(label, value, valueClass, valueStyle) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label';
  labelDiv.textContent = label;
  const valueDiv = document.createElement('div');
  valueDiv.className = valueClass ? `value ${valueClass}` : 'value';
  if (valueStyle) valueDiv.style.cssText = valueStyle;
  valueDiv.textContent = value;
  card.append(labelDiv, valueDiv);
  return card;
}

// ── Charts ─────────────────────────────────────────────────────────────────

export const SCALE_OPTS = {
  x: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
  y: { ticks: { color: '#8b949e' }, grid: { color: '#21262d' } },
};

// ── Shared helpers for the newer tabs ──────────────────────────────────────

export function zeroCell(v) {
  const td = document.createElement('td');
  if (v) {
    td.textContent = Number(v).toLocaleString();
  } else {
    const span = document.createElement('span');
    span.className = 'zero';
    span.textContent = '—';
    td.appendChild(span);
  }
  return td;
}

// Alloys + exotic resources, shown as their own collected cards. Values may be
// stored flat on totals or inside a `rare` map; read either.
export const EXTRA_RESOURCES = [
  ['alloys', 'Alloys', 'alloys'],
  ['cryo_ice', 'Cryo-Ice', 'hydrogen'],
  ['quantum_dust', 'Quantum Dust', 'rare'],
  ['plasma_core', 'Plasma Core', 'rare'],
  ['dark_matter', 'Dark Matter', 'rare'],
  ['antimatter', 'Antimatter', 'rare'],
];

export const EXTRA_RES_KEYS_UI = EXTRA_RESOURCES.map(e => e[0]);

export function resourceVal(totals, key) {
  if (totals && totals[key] != null) return totals[key];
  return (totals && totals.rare && totals.rare[key]) || 0;
}

// Append the alloys + exotic-resource cards (alloys always; rares only when
// some has been collected) to a collected-resources container.
export function appendExtraResourceCards(container, totals, suffix) {
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    const v = resourceVal(totals, key);
    if (key === 'alloys' || v > 0) container.appendChild(makeStatCard(`${label}${suffix}`, fmt(v), cls));
  }
}

export function appendRareCards(container, rare, suffix) {
  Object.entries(rare || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => container.appendChild(
      makeStatCard(`${k.replace(/_/g, ' ')}${suffix}`, fmt(v), 'rare')
    ));
}

export function renderPagedTable(reports, page, infoId, prevId, nextId, tbodyId, rowFn) {
  const totalPages = Math.ceil(reports.length / PER_PAGE);
  const maxPage = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), maxPage);
  document.getElementById(infoId).textContent = `Page ${safePage} / ${maxPage} (${reports.length} total)`;
  document.getElementById(prevId).disabled = safePage <= 1;
  document.getElementById(nextId).disabled = safePage >= totalPages;
  const tbody = document.getElementById(tbodyId);
  tbody.textContent = '';
  for (const r of reports.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)) {
    tbody.appendChild(rowFn(r));
  }
}

// Fill a stats container with ore/silicates/hydrogen/alloys + rare cards.
export function fillResourceCards(containerId, res, suffix) {
  const el = document.getElementById(containerId);
  if (!el) return;
  res = res || emptyResources();
  el.textContent = '';
  el.append(
    makeStatCard(`Ore${suffix}`, fmt(res.ore || 0), 'ore'),
    makeStatCard(`Silicates${suffix}`, fmt(res.silicates || 0), 'silicates'),
    makeStatCard(`Hydrogen${suffix}`, fmt(res.hydrogen || 0), 'hydrogen'),
    makeStatCard(`Alloys${suffix}`, fmt(res.alloys || 0), 'alloys'),
  );
  appendRareCards(el, res.rare, suffix);
}

// Renders a { destroyed, repair } loss into two separate titled containers.
// Pass repairId = null for tabs with no repair concept (debris, expeditions).
export function renderLostCards(destroyedId, repairId, lost, periodLabel) {
  fillResourceCards(destroyedId, lost.destroyed, periodLabel);
  if (repairId) fillResourceCards(repairId, lost.repair, periodLabel);
}

// Relative value of each resource, used to weight the net total.
export const RESOURCE_WEIGHTS = { ore: 1, silicates: 2, hydrogen: 3, alloys: 5 };
export const RARE_WEIGHT = 10;   // exotic resources (ice, quantum dust, …) in the net total

// Net gain cards: resources collected minus ship build costs, per resource
// (raw), plus a weighted total (ore×1, silicates×2, hydrogen×3, alloys×5).
// Rare resource losses are not in the total (no common valuation).
export function renderNetCards(containerId, collected, lost, periodLabel, fuelHydrogen = 0) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.textContent = '';
  const cost = combinedLost(lost);   // destruction + repair
  const fuel = fuelHydrogen || 0;
  const fields = [
    ['Ore', 'ore'], ['Silicates', 'silicates'], ['Hydrogen', 'hydrogen'], ['Alloys', 'alloys'],
  ];
  let total = 0;
  for (const [label, key] of fields) {
    let v = (collected[key] || 0) - (cost[key] || 0);
    if (key === 'hydrogen') v -= fuel;   // fuel is hydrogen burned on the trip
    total += v * RESOURCE_WEIGHTS[key];
    el.appendChild(makeStatCard(`${label} net${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), key));
  }
  // Exotic resources — net (collected − any rare ship-cost), weighted ×10 in
  // the total. Shown when present either side.
  for (const [key, label, cls] of EXTRA_RESOURCES) {
    if (key === 'alloys') continue;   // already a core field above
    const got = resourceVal(collected, key);
    const spent = resourceVal(cost, key);
    if (!got && !spent) continue;
    const v = got - spent;
    total += v * RARE_WEIGHT;
    el.appendChild(makeStatCard(`${label} net${periodLabel}`, (v >= 0 ? '+' : '') + fmt(v), cls));
  }
  const totalCard = makeStatCard(`Total net${periodLabel}`, (total >= 0 ? '+' : '') + fmt(total),
    '', total >= 0 ? 'color:#56d364' : 'color:#ff7b72');
  totalCard.title = 'Weighted: ore×1, silicates×2, hydrogen×3, alloys×5, exotics×10.'
    + (fuel ? ` Includes ${fmt(fuel)} hydrogen fuel (est.).` : '');
  el.appendChild(totalCard);
}

// Doughnut of a loot/resource breakdown (ore, silicates, hydrogen, alloys and
// any rares) for the current view period. `totals` is a mode-aware totals
// object; returns the Chart instance.
export const RESOURCE_COLORS = {
  ore: '#f0883e', silicates: '#56d364', hydrogen: '#79c0ff', alloys: '#e3b341',
};
export const RARE_PALETTE = ['#bc8cff', '#d2a8ff', '#ff7b72', '#ffa657', '#a5d6ff', '#7ee787'];

export function makeResourceDoughnut(canvasId, totals) {
  const entries = [];
  for (const k of ['ore', 'silicates', 'hydrogen', 'alloys']) {
    if (totals[k] > 0) entries.push([k, totals[k], RESOURCE_COLORS[k]]);
  }
  let ri = 0;
  for (const [k, v] of Object.entries(totals.rare || {})) {
    if (v > 0) entries.push([k.replace(/_/g, ' '), v, RARE_PALETTE[ri++ % RARE_PALETTE.length]]);
  }
  const total = entries.reduce((s, e) => s + e[1], 0);
  return new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: {
      labels: entries.map(e => {
        const pct = total ? (e[1] / total * 100).toFixed(1) : 0;
        return `${e[0]} — ${Number(e[1]).toLocaleString()} (${pct}%)`;
      }),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: entries.map(e => e[2]) }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#e6edf3', font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ` ${Number(ctx.parsed).toLocaleString()} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// Colored zone badge cell for report tables.
export const ZONE_COLORS = {
  sentinel: '#56d364', open: '#f0883e', dead: '#ff7b72', rift: '#d2a8ff', unknown: '#8b949e',
};
export function zoneCell(zone) {
  const z = zone || 'unknown';
  const td = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = z;
  badge.style.color = ZONE_COLORS[z] || ZONE_COLORS.unknown;
  td.appendChild(badge);
  return td;
}

// ── Sortable tables ─────────────────────────────────────────────────────────
// Click a th.sortable[data-key] to sort; click again to flip. `state` is a
// plain { key, dir } object the caller keeps; `rerender` redraws the table.
export function attachSortable(headId, state, rerender) {
  const head = document.getElementById(headId);
  if (!head) return;
  head.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    state.dir = state.key === th.dataset.key ? -state.dir : -1;
    state.key = th.dataset.key;
    rerender();
  });
}

// Sort a copy of records by the state, draw the header arrow, and return it.
export function applySort(headId, records, state, tiebreak = 'created_at') {
  const { key, dir } = state;
  document.querySelectorAll(`#${headId} th.sortable`).forEach(th => {
    const old = th.querySelector('.arrow');
    if (old) old.remove();
    if (th.dataset.key === key) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = dir === -1 ? ' ▼' : ' ▲';
      th.appendChild(arrow);
    }
  });
  return records.slice().sort((a, b) => {
    const va = a[key], vb = b[key];
    let cmp;
    if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
    else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
    return cmp * dir || String(b[tiebreak] ?? '').localeCompare(String(a[tiebreak] ?? ''));
  });
}
