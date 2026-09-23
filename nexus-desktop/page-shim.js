// `browser.*` for pages that are not extension contexts: the game page (injected
// through CDP into an isolated world) and the dashboard served over HTTP. Every
// call is an HTTP RPC to the companion, which owns storage and runs background.js.
// The companion serves this file in place of browser-polyfill.js.
(() => {
  if (globalThis.browser?.runtime?.id) return;   // already installed (re-injection)
  const BASE = '__NX_BASE__';
  const rpc = (route, payload) => fetch(BASE + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? null),
  }).then(r => r.json()).then(r => {
    if (r.error !== undefined) throw new Error(r.error);
    return r.result;
  });
  const msgListeners = [];
  const changeListeners = [];
  globalThis.browser = {
    runtime: {
      id: 'nexus-desktop',
      getURL: p => `${BASE}/${p}`,
      getManifest: () => ({ version: 'desktop' }),
      sendMessage: msg => rpc('/message', msg),
      onMessage: { addListener: fn => msgListeners.push(fn) },
    },
    storage: {
      local: {
        get: keys => rpc('/storage/get', keys),
        set: items => rpc('/storage/set', items),
        remove: keys => rpc('/storage/remove', keys),
        clear: () => rpc('/storage/clear'),
      },
      onChanged: { addListener: fn => changeListeners.push(fn) },
    },
  };
  // Companion → page: tabs.sendMessage lands here (CDP Runtime.evaluate).
  globalThis.__nxDeliver = msg => new Promise(resolve => {
    for (const fn of msgListeners) {
      let answered = false;
      const r = fn(msg, {}, v => { answered = true; resolve(v); });
      if (r === true || answered) return;
      if (r && typeof r.then === 'function') return void r.then(resolve);
    }
    resolve(undefined);
  });
  const es = new EventSource(`${BASE}/events`);
  es.onmessage = e => {
    const changes = JSON.parse(e.data);
    for (const fn of changeListeners) fn(changes, 'local');
  };
})();
