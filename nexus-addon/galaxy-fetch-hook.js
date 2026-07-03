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
    let data;
    try { data = JSON.parse(text); }                       // only the parse can throw
    catch (e) { console.debug('[nx] planets response not JSON', e); return; }
    const fields = (data.asteroidFields || []).map(f => ({
      id: f.id, remaining: f.remainingResources,
      richness: f.richness, type: f.fieldType,
    }));
    if (fields.length) window.postMessage({ __nxFields: fields }, window.location.origin);
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    if (PLANETS.test(url)) {
      p.then(r => r.clone().text()).then(relay)
        .catch(e => console.debug('[nx] planets fetch relay failed', e));
    }
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
      if (PLANETS.test(this.__nxUrl || '')) relay(this.responseText);
    });
    return origSend.apply(this, args);
  };
})();
