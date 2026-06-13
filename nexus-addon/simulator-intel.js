// Simulator: fleet import and intel auto-fill (spy + camp scout reports).

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

// ── Intel reports (spy + camp scout) → defender auto-fill ──────────────────

let intelReports = [];

async function loadIntelReports() {
  const { spy_reports, camp_scout_reports } =
    await browser.storage.local.get(['spy_reports', 'camp_scout_reports']);
  intelReports = [];
  for (const r of (camp_scout_reports || [])) {
    if (!r.fleet?.length) continue;
    intelReports.push({
      id: `camp-${r.id}`,
      label: `Camp #${r.camp_id ?? '?'} — ${new Date(r.created_at).toLocaleDateString()}`,
      fleet: r.fleet, buildings: [], resources: null,
    });
  }
  for (const r of (spy_reports || [])) {
    intelReports.push({
      id: `spy-${r.id}`,
      label: `Spy: ${r.target_name}${r.target_user ? ` (${r.target_user})` : ''} — ${new Date(r.created_at).toLocaleDateString()}`,
      fleet: r.fleet || [], buildings: r.buildings || [], resources: r.resources,
    });
  }
  const sel = document.getElementById('report-select');
  while (sel.options.length > 1) sel.remove(1);
  for (const r of intelReports) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.label;
    sel.appendChild(o);
  }
}

document.getElementById('report-select').addEventListener('change', function () {
  const r = intelReports.find(x => x.id === this.value);
  if (!r) return;

  document.querySelectorAll('input[data-side="defender"][data-key]').forEach(input => {
    const item = r.fleet.find(f => f.key === input.dataset.key);
    input.value = item ? item.quantity : 0;
  });

  let turret = 0, shieldGen = 0, ew = 0;
  for (const b of (r.buildings || [])) {
    const k = (b.key || '').toLowerCase();
    const lvl = b.level || 0;
    if (k.includes('turret') || k.includes('railgun') || k.includes('defense')) turret = Math.max(turret, lvl);
    else if (k.includes('shield')) shieldGen = Math.max(shieldGen, lvl);
    else if (k.includes('ew') || k.includes('electronic')) ew = Math.max(ew, lvl);
  }
  document.getElementById('def-turret').value = turret;
  document.getElementById('def-shield').value = shieldGen;
  document.getElementById('def-ew').value = ew;

  renderTargetIntel(r);
  const total = r.fleet.reduce((s, f) => s + f.quantity, 0);
  document.getElementById('sim-status').textContent =
    `Defender filled from report: ${total} ships, turret ${turret}, shield ${shieldGen}, EW ${ew}.`;
});

const LOOT_FACTOR = 0.5; // assumed share of resources lootable in a raid

function renderTargetIntel(r) {
  const panel = document.getElementById('target-intel');
  panel.textContent = '';
  if (!r.resources || !Object.keys(r.resources).length) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';

  const note = text => {
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    div.textContent = text;
    return div;
  };

  let numericTotal = 0;
  let qualitative = false;
  const parts = [];
  for (const [k, v] of Object.entries(r.resources)) {
    if (typeof v === 'number') {
      numericTotal += v;
      if (v) parts.push(`${k}: ${fmt(v)}`);
    } else if (v && v !== 'none') {
      qualitative = true;
      parts.push(`${k}: ${v}`);
    }
  }

  panel.appendChild(note(`Target resources — ${parts.join(' · ') || 'none reported'}`));

  if (numericTotal > 0) {
    const loot = numericTotal * LOOT_FACTOR;
    const options = [];
    for (const key of ['freighter', 'bulk_carrier', 'ore_freighter']) {
      const d = shipDefs[key];
      if (d?.cargoCapacity) options.push(`${Math.ceil(loot / d.cargoCapacity)}× ${d.name}`);
    }
    panel.appendChild(note(`Cargo for ~${LOOT_FACTOR * 100}% loot (${fmt(loot)}): ${options.join(' or ')}`));
  } else if (qualitative) {
    panel.appendChild(note('Amounts are qualitative — higher spy power gives numbers and a cargo estimate.'));
  }
}
