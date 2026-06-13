// Debris tab.

// ── Debris tab ─────────────────────────────────────────────────────────────

function renderDebrisTab() {
  const gen = store.pirate_debris_total || { ore: 0, alloys: 0, silicates: 0 };
  const genEl = document.getElementById('d-stats-generated');
  genEl.textContent = '';
  genEl.append(
    makeStatCard('Ore', fmt(gen.ore), 'ore'),
    makeStatCard('Silicates', fmt(gen.silicates), 'silicates'),
    makeStatCard('Alloys', fmt(gen.alloys), 'alloys'),
  );

  const col = store.debris_collected_est || { ore: 0, silicates: 0, alloys: 0, hydrogen: 0 };
  const colEl = document.getElementById('d-stats-collected');
  colEl.textContent = '';
  colEl.append(
    makeStatCard('Ore', fmt(col.ore), 'ore'),
    makeStatCard('Silicates', fmt(col.silicates), 'silicates'),
    makeStatCard('Alloys', fmt(col.alloys), 'alloys'),
    makeStatCard('Hydrogen', fmt(col.hydrogen), 'hydrogen'),
  );

  document.getElementById('d-last-check').textContent = store.debris_last_check
    ? `Last check: ${new Date(store.debris_last_check).toLocaleString()}`
    : 'Not checked yet.';

  const tbody = document.getElementById('d-fields-tbody');
  tbody.textContent = '';
  const fields = (store.debris_fields || []).slice()
    .sort((a, b) => (b.ore + b.silicates + b.alloys) - (a.ore + a.silicates + a.alloys));
  if (!fields.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.style.color = '#484f58';
    td.textContent = 'No debris fields currently visible.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const f of fields) {
    const tr = document.createElement('tr');
    const tdSys = document.createElement('td');
    tdSys.textContent = f.system;
    const tdOre = zeroCell(f.ore); tdOre.className = 'ore';
    const tdSil = zeroCell(f.silicates); tdSil.className = 'silicates';
    const tdAl = zeroCell(f.alloys); tdAl.className = 'alloys';
    const tdHyd = zeroCell(f.hydrogen); tdHyd.className = 'hydrogen';
    const tdFirst = document.createElement('td');
    tdFirst.textContent = new Date(f.first_seen).toLocaleString();
    const tdUpd = document.createElement('td');
    tdUpd.textContent = new Date(f.updated_at).toLocaleString();
    tr.append(tdSys, tdOre, tdSil, tdAl, tdHyd, tdFirst, tdUpd);
    tbody.appendChild(tr);
  }
}
