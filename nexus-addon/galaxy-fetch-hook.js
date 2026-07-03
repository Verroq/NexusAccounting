// Runs in the PAGE world (manifest world:"MAIN") at document_start, so it wraps
// the page's network calls before the game grabs its own references. The game
// only renders a field's *percent* remaining; the optimal-ships calc needs the
// absolute resource amount + field type, which live in the /systems/{id}/planets
// response the game fetches on system select. Relay the field stats to the
// isolated content script (galaxy-fields.js) via postMessage. Wrap both fetch
// and XHR since we don't know which transport the game uses.
(function () {
  const PLANETS = /\/api\/galaxy\/systems\/\d+\/planets/;

  function relay(text) {
    try {
      const data = JSON.parse(text);
      const fields = (data.asteroidFields || []).map(f => ({
        id: f.id, remaining: f.remainingResources,
        richness: f.richness, type: f.fieldType,
      }));
      if (fields.length) window.postMessage({ __nxFields: fields }, window.location.origin);
    } catch {}
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (PLANETS.test(url)) p.then(r => r.clone().text()).then(relay).catch(() => {});
    } catch {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__nxUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      try { if (PLANETS.test(this.__nxUrl || '')) relay(this.responseText); } catch {}
    });
    return origSend.apply(this, args);
  };
})();
