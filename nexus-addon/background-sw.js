// Service-worker entry. Static imports only (Chrome MV3 forbids top-level await
// in service workers), evaluated in order: the polyfill defines `browser.*`
// before background.js — which uses it — runs. Firefox provides `browser`
// natively; the polyfill is a no-op there.
import './browser-polyfill.js';
import './background.js';
