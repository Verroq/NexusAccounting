// Simulator: engine validation against recorded pirate raids.

// ── Engine validation against recorded raids ───────────────────────────────

const VALIDATE_OPTS = { sims: 200, maxRounds: 10, variance: 0.1, debrisRate: 0.3, shieldRegen: false };

function fleetArrayToMap(arr) {
  const fleet = {};
  for (const i of (arr || [])) {
    if (shipDefs[i.key] && i.quantity > 0) fleet[i.key] = (fleet[i.key] || 0) + i.quantity;
  }
  return fleet;
}

function fleetLabel(arr) {
  return (arr || []).map(i => `${i.quantity}× ${i.key.replace(/_/g, ' ')}`).join(', ');
}

document.getElementById('btn-validate').addEventListener('click', async function () {
  this.disabled = true;
  this.textContent = 'Validating…';
  const tbody = document.getElementById('validation-tbody');
  const summary = document.getElementById('validation-summary');

  try {
    const { pirate_recent_reports } = await browser.storage.local.get('pirate_recent_reports');
    const replayable = (pirate_recent_reports || [])
      .filter(r => r.attacker_fleet?.length && r.pirate_fleet?.length)
      .slice(0, 50);

    summary.textContent = '';
    tbody.textContent = '';
    document.getElementById('validation-results').style.display = '';

    if (!replayable.length) {
      summary.appendChild(makeStatCard('Replayable raids',
        '0 — older records lack fleet data; new raids will include it', ''));
      return;
    }

    let outcomeHits = 0;
    let lossErrSum = 0;

    for (const r of replayable) {
      const result = runSimulations(
        fleetArrayToMap(r.attacker_fleet),
        fleetArrayToMap(r.pirate_fleet),
        VALIDATE_OPTS
      );
      const winRate = result.outcomes.attacker_won / VALIDATE_OPTS.sims;
      const predictedWon = winRate >= 0.5;
      const actualWon = r.outcome === 'attacker_won';
      const match = predictedWon === actualWon;
      if (match) outcomeHits++;

      const actualRemoved = (r.ships_lost || 0) + (r.ships_damaged || 0);
      const predictedRemoved = Object.values(result.attackerLosses)
        .reduce((s, l) => s + l.lost, 0);
      lossErrSum += Math.abs(predictedRemoved - actualRemoved);

      const tr = document.createElement('tr');
      const cells = [
        new Date(r.created_at).toLocaleDateString(),
        fleetLabel(r.attacker_fleet),
        fleetLabel(r.pirate_fleet),
        (r.outcome || 'unknown').replace(/_/g, ' '),
        `${(winRate * 100).toFixed(0)}%`,
        String(actualRemoved),
        predictedRemoved.toFixed(1),
        match ? '✓' : '✗',
      ];
      cells.forEach((v, idx) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (idx === 7) td.style.color = match ? '#56d364' : '#ff7b72';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }

    summary.append(
      makeStatCard('Raids replayed', String(replayable.length), 'missions'),
      makeStatCard('Outcome accuracy', `${(outcomeHits / replayable.length * 100).toFixed(0)}%`,
        outcomeHits === replayable.length ? 'silicates' : ''),
      makeStatCard('Avg loss error (ships)', (lossErrSum / replayable.length).toFixed(2), ''),
    );
  } finally {
    this.disabled = false;
    this.textContent = 'Validate';
  }
});
