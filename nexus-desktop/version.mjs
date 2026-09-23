// Release-version compare, in its own file so a test can import it without
// booting the companion (importing companion.mjs starts its server).

// Numeric, field by field, so 2.10.0 beats 2.9.0 — a string compare gets that
// wrong. A missing field counts as 0, and a tag's leading "v" is ignored.
export function isNewer(a, b) {
  const parts = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}
