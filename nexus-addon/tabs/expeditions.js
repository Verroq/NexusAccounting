// Expeditions & wormhole runs tab.

// ── Expeditions tab ────────────────────────────────────────────────────────

let chartExpeditions;

let expPage = 1;

function getExpBucketReports(mode) {
  return latestBucket(store.exp_recent_reports || [], mode);
}

// Per-report records carry the full loot map, so all resources (rares included)
// work in every view mode.
function getExpTotalsForMode(mode) {
  if (mode === 'all') {
    return store.exp_totals || { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  }
  const t = { ore: 0, silicates: 0, hydrogen: 0, alloys: 0, rare: {}, missions: 0, ships_lost: 0 };
  for (const r of getExpBucketReports(mode)) {
    for (const [k, v] of Object.entries(r.loot || {})) {
      if (k in t && k !== 'rare' && k !== 'missions' && k !== 'ships_lost') t[k] += v;
      else if (!['ore', 'silicates', 'hydrogen', 'alloys'].includes(k)) t.rare[k] = (t.rare[k] || 0) + v;
    }
    t.missions += 1;
    t.ships_lost += r.ships_lost || 0;
  }
  return t;
}

function getExpSeriesForMode(mode) {
  if (mode !== 'hourly') return store.exp_daily || [];
  return computeHourlySeries(store.exp_recent_reports || [], {
    ore: r => r.loot?.ore || 0,
    silicates: r => r.loot?.silicates || 0,
    hydrogen: r => r.loot?.hydrogen || 0,
  });
}

function renderExpeditionsTab() {
  const mode = getMode();
  const periodLabel = periodLabelFor(mode);
  const t = getExpTotalsForMode(mode);
  const el = document.getElementById('e-stats-collected');
  el.textContent = '';
  if (!store.exp_totals || !store.exp_totals.missions) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = 'No expedition or wormhole reports recorded yet.';
    el.appendChild(p);
  } else {
    el.append(
      makeStatCard(`Ore${periodLabel}`, fmt(t.ore), 'ore'),
      makeStatCard(`Silicates${periodLabel}`, fmt(t.silicates), 'silicates'),
      makeStatCard(`Hydrogen${periodLabel}`, fmt(t.hydrogen), 'hydrogen'),
      makeStatCard(`Alloys${periodLabel}`, fmt(t.alloys), 'alloys'),
      makeStatCard(`Missions${periodLabel}`, fmt(t.missions), 'missions'),
      makeStatCard(`Ships lost${periodLabel}`, fmt(t.ships_lost), '', 'color:#ff7b72'),
    );
    appendRareCards(el, t.rare, periodLabel);
  }

  if (chartExpeditions) chartExpeditions.destroy();
  chartExpeditions = makeResourceLineChart('chart-expeditions', getExpSeriesForMode(mode), getLabelKey(mode));

  renderExpTable();
}

function renderExpTable() {
  const reports = (store.exp_recent_reports || []).slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  renderPagedTable(reports, expPage, 'e-page-info', 'e-btn-prev', 'e-btn-next', 'e-reports-tbody', r => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdKind = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.kind;
    tdKind.appendChild(badge);
    const tdLoc = document.createElement('td');
    tdLoc.textContent = r.location || '—';
    const tdEvent = document.createElement('td');
    tdEvent.textContent = r.event ? String(r.event).replace(/_/g, ' ') : '—';
    const tdLoot = document.createElement('td');
    tdLoot.textContent = Object.entries(r.loot || {})
      .map(([k, v]) => `${k}: ${Number(v).toLocaleString()}`)
      .join(', ') || '—';
    tr.append(tdDate, tdKind, tdLoc, tdEvent, tdLoot, zeroCell(r.ships_lost));
    return tr;
  });
}

document.getElementById('e-btn-prev').addEventListener('click', () => { expPage--; renderExpTable(); });

document.getElementById('e-btn-next').addEventListener('click', () => { expPage++; renderExpTable(); });
