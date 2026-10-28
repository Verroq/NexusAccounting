// Game "dynamic API" transport, for universes where game-config has
// dynamicApiEnabled (nf2 as of 2026-10-27; s0 has it off). On those, ~40
// galaxy/fleet endpoints answer a plain call with 403 DYNAMIC_API_REQUIRED and
// only accept the game client's encoded form:
//
//   POST /api/transport/bootstrap { previousId } → { id, moduleUrl }
//   GET  moduleUrl → per-session JS module carrying { version, id, operations,
//        ttlMs } and a 16-byte seed for the key codec
//   GET  /api/transport/r/{id}/{operations[i]}?d=<encoded { id, query }>
//   POST /api/transport/r/{id}/{operations[i]}  body <encoded { id, query, body }>
//   response decoded when X-Dynamic-Context == id
//
// The module is never executed: its metadata and seed are read as text and the
// codec (XOR of each object key with the seed, values untouched) is
// reimplemented here. Same approach as the Severance Intel addon.
//
// Isolated-world content script, loaded before sidebar-inject.js (GAME_FETCH
// calls request() below). IIFE + re-run guard: a second injection would
// otherwise throw on the top-level declarations.
(() => {
  if (globalThis.NexusTransport) return;

  // Operation table, in the client's order (index = position in
  // module.operations). liveRoutes() reads it from the game's own bundle on
  // each page load; this copy (nf2 bundle, 2026-10-27: `Ke`, with the v2
  // actions `Kt` spliced in at 32 and colony-index appended) is the fallback.
  const FALLBACK = [
    ['GET', '/galaxy/systems/:id/planets'], ['POST', '/fleet/fuel-estimate'],
    ['POST', '/fleet/patrol/fuel-estimate'], ['POST', '/moons/:id/send-estimate'],
    ['POST', '/moons/:id/dispatch-estimate'], ['POST', '/stations/:id/dispatch-estimate'],
    ['GET', '/galaxy/map'], ['GET', '/galaxy/planet-index'], ['GET', '/galaxy/field-index'],
    ['GET', '/galaxy/station-index'], ['GET', '/galaxy/search'], ['GET', '/galaxy/alliance-systems'],
    ['GET', '/galaxy/arms'], ['GET', '/galaxy/arms/:id/sectors'], ['GET', '/galaxy/sectors/:id/systems'],
    ['GET', '/galaxy/rift-sectors'], ['GET', '/galaxy/post-rift'], ['GET', '/galaxy/colony-status'],
    ['POST', '/outposts/:id/relocate/estimate'], ['POST', '/fleet/mining-fleet-operation-estimate'],
    ['GET', '/fleet/zone/:id'], ['GET', '/fleet/target-info/:id'], ['GET', '/stations/sector/:id'],
    ['GET', '/stations/:id'], ['GET', '/moons/:id/scan/sectors'], ['GET', '/moons/:id/scan/targets'],
    ['GET', '/fleet/beacons'], ['GET', '/fleet/minefields'], ['GET', '/fleet/pirate-camps'],
    ['GET', '/fleet/system-debris'], ['GET', '/fleet/wormholes'], ['POST', '/planets/:id/relocation/preview'],
    ['POST', '/fleet/mine'], ['POST', '/outposts/:id/dispatch-mining'], ['POST', '/fleet/survey'],
    ['POST', '/fleet/investigate'], ['POST', '/fleet/attack-pirates'], ['POST', '/fleet/collect-salvage'],
    ['POST', '/fleet/collect-debris'],
    ['GET', '/galaxy/colony-index'],
  ];

  // The bracketed literal starting at js[start], by bracket depth. The table
  // holds only path strings and a `([e,t])=>[e,t]` callback, both balanced.
  function literalAt(js, start) {
    for (let i = start, depth = 0; i < js.length; i++) {
      if (js[i] === '[') depth++;
      else if (js[i] === ']' && --depth === 0) return js.slice(start, i + 1);
    }
    return null;
  }

  // The client's table out of its bundle source, read as data (never run):
  //   Ke=[["GET","/galaxy/systems/:id/planets"],…,...Kt.map(([e,t])=>[e,t]),…]
  //   Kt=[["POST","/fleet/mine","planet_mining"],…]
  // Minified names change every build, so the table is found by its first
  // entry and the spread list by the name the spread uses. null if the shape
  // moved.
  function parseRoutes(js) {
    const start = js.indexOf('[["GET","/galaxy/systems/:id/planets"]');
    let body = start < 0 ? null : literalAt(js, start);
    if (!body) return null;
    body = body.replace(/\.\.\.([\w$]+)\.map\(\(\[[\w$]+,[\w$]+\]\)=>\[[\w$]+,[\w$]+\]\)/g, (all, name) => {
      const at = js.indexOf(`${name}=[[`);
      const list = at < 0 ? null : literalAt(js, at + name.length + 1);
      return list ? list.slice(1, -1) : all;   // unresolved → JSON.parse fails → null
    });
    try {
      const table = JSON.parse(body).map(([method, path]) => [method, path]);
      return table.every(([m, p]) => (m === 'GET' || m === 'POST') && /^\/[\w:/-]+$/.test(p)) ? table : null;
    } catch { return null; }
  }

  let livePromise = null;
  function liveRoutes() {
    return livePromise ||= (async () => {
      const src = document.querySelector('script[src*="/assets/index-"]')?.src;
      if (!src) return null;
      const r = await fetch(src);   // the page loaded it already: browser cache
      return r.ok ? parseRoutes(await r.text()) : null;
    })().catch(() => null);
  }

  const compile = table => table.map(([method, path]) =>
    ({ method, re: new RegExp('^' + path.replace(':id', '([^/]+)') + '$', 'i') }));
  const FALLBACK_ROUTES = compile(FALLBACK);
  let liveCompiled = null;
  async function routes() {
    const live = await liveRoutes();
    return live ? (liveCompiled ||= compile(live)) : FALLBACK_ROUTES;
  }

  // { index, id, tableSize } for a method + '/api/...' path, or null when not covered.
  async function route(method, path) {
    const table = await routes();
    const p = String(path).split('?')[0].replace(/^\/api(?=\/)/i, '').replace(/\/$/, '');
    for (let i = 0; i < table.length; i++) {
      if (table[i].method !== method.toUpperCase()) continue;
      const m = table[i].re.exec(p);
      if (m) return { index: i, id: m[1] ? decodeURIComponent(m[1]) : null, tableSize: table.length };
    }
    return null;
  }

  function codec(seed) {
    function walk(v, decode, depth = 0) {
      if (depth > 32) throw new Error('Transport payload too deep');
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(x => walk(x, decode, depth + 1));
      const out = {};
      for (const name of Object.keys(v)) {
        let key = decode ? '' : 'k';
        if (decode) {
          if (!/^k(?:[0-9a-f]{4})*$/.test(name)) throw new Error('Invalid transport field');
          for (let i = 1, j = 0; i < name.length; i += 4, j++) {
            key += String.fromCharCode(parseInt(name.slice(i, i + 4), 16) ^ seed[j % 16]);
          }
        } else {
          for (let i = 0; i < name.length; i++) {
            key += (name.charCodeAt(i) ^ seed[i % 16]).toString(16).padStart(4, '0');
          }
        }
        // defineProperty: a decoded "__proto__" key stays a plain own property.
        Object.defineProperty(out, key, { value: walk(v[name], decode, depth + 1), enumerable: true });
      }
      return out;
    }
    return { encode: v => walk(v, false), decode: v => walk(v, true) };
  }

  function parseModule(src, id) {
    const seed = src.match(/\}\)\(\s*(\[[\d,\s]+\])\s*\)/);
    const meta = src.match(/Object\.assign\(\s*(\{"version"\s*:[\s\S]*?\})\s*,/);
    if (!seed || !meta) throw new Error('Unsupported transport module (game update?)');
    const m = JSON.parse(meta[1]);
    const s = JSON.parse(seed[1]);
    if (m.id !== id || !Array.isArray(m.operations) || s.length !== 16 || !(m.ttlMs > 0)) {
      throw new Error('Unexpected transport module shape (game update?)');
    }
    return { ...m, ...codec(s), deadline: Date.now() + m.ttlMs - 2000 };
  }

  let current = null;    // parsed module, until its ttl runs out
  let pending = null;

  function load() {
    if (current && current.deadline > Date.now()) return Promise.resolve(current);
    pending ||= (async () => {
      const r = await fetch('/api/transport/bootstrap', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousId: current?.id }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Transport bootstrap ${r.status} ${b.code || ''}`.trim());
      if (b.enabled === false) return (current = null);
      if (!/^[a-f0-9]{36}$/.test(b.id) || b.moduleUrl !== `/api/transport/module/${b.id}.js`) {
        throw new Error('Unexpected transport bootstrap');
      }
      const js = await fetch(b.moduleUrl, { credentials: 'same-origin', cache: 'no-store' });
      if (!js.ok) throw new Error(`Transport module ${js.status}`);
      return (current = parseModule(await js.text(), b.id));
    })().finally(() => { pending = null; });
    return pending;
  }

  // Encoded request. Resolves to { status, data, headers } with data decoded,
  // or null when the server says the transport is off (caller does a plain
  // fetch). One retry on an expired session module.
  async function request(method, path, body, headers = {}) {
    const r = await route(method, path);
    if (!r) return null;
    const query = Object.fromEntries(new URL(path, location.origin).searchParams);
    for (let attempt = 0; attempt < 2; attempt++) {
      const mod = await load();
      if (!mod) return null;
      // The client builds its table from the same build that serves the
      // module, so sizes match. A mismatch means our table is stale: an index
      // could then name another endpoint (even a fleet action), so refuse.
      if (mod.operations.length !== r.tableSize) {
        throw new Error(`Transport table out of date (${r.tableSize} routes, game has ${mod.operations.length}): reload the game tab`);
      }
      const post = method.toUpperCase() === 'POST';
      const payload = JSON.stringify(mod.encode({ id: r.id, query, ...(post ? { body } : {}) }));
      const url = `/api/transport/r/${mod.id}/${mod.operations[r.index]}` +
        (post ? '' : `?d=${encodeURIComponent(payload)}`);
      const res = await fetch(url, {
        method, credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(post ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: post ? payload : undefined,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
      if (res.headers.get('X-Dynamic-Context') === mod.id && res.status !== 304) data = mod.decode(data);
      const code = data && data.code;
      if (code === 'DYNAMIC_API_EXPIRED' && attempt === 0) { current = null; continue; }
      if (code === 'DYNAMIC_API_DISABLED') { current = null; return null; }
      return { status: res.status, data, headers: res.headers };
    }
    throw new Error('Transport session expired');
  }

  // fetch() for content scripts calling the game API from the page: plain call,
  // encoded retry when a covered path answers DYNAMIC_API_REQUIRED (refused
  // before it ran, so a POST is not repeated). Remembered for this tab.
  // Resolves to { status, data }.
  let required = false;
  async function call(method, path, body) {
    const covered = await route(method, path);
    if (required && covered) {
      const t = await request(method, path, body);
      if (t) return t;
    }
    const post = method.toUpperCase() === 'POST';
    const r = await fetch(path, {
      method, credentials: 'include',
      headers: post ? { 'Content-Type': 'application/json' } : {},
      body: post ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (covered && data && data.code === 'DYNAMIC_API_REQUIRED') {
      required = true;
      const t = await request(method, path, body);
      if (t) return t;
    }
    return { status: r.status, data };
  }

  globalThis.NexusTransport = Object.freeze({ route, request, call, codec, parseRoutes });
})();
