'use strict';
// Shared test fixtures and the browser-API stub used to run background.js
// under node.

const fs = require('fs');
const path = require('path');

// Real ship stats from the shipyard API (2026-06).
const SHIP_DEFS = {
  scout:       { key: 'scout',       name: 'Scout',       hp: 100, shieldHp: 25, attack: 15,  weaponType: 'kinetic', armorType: 'light',    shipSize: 'small',   costOre: 200, costSilicates: 100, costHydrogen: 0,   costAlloys: 20 },
  fighter:     { key: 'fighter',     name: 'Fighter',     hp: 250, shieldHp: 60, attack: 30,  weaponType: 'laser',   armorType: 'light',    shipSize: 'small',   costOre: 500, costSilicates: 250, costHydrogen: 50,  costAlloys: 100 },
  interceptor: { key: 'interceptor', name: 'Interceptor', hp: 200, shieldHp: 50, attack: 35,  weaponType: 'kinetic', armorType: 'light',    shipSize: 'small',   costOre: 900, costSilicates: 500, costHydrogen: 200, costAlloys: 200 },
  bomber:      { key: 'bomber',      name: 'Bomber',      hp: 650, shieldHp: 150, attack: 120, weaponType: 'missile', armorType: 'heavy',   shipSize: 'large',   costOre: 1000, costSilicates: 500, costHydrogen: 300, costAlloys: 200 },
};

// Stubbed browser.storage.local backed by a plain object. Returns the store
// so tests can inspect and seed it.
function makeBrowserStub(store = {}) {
  global.browser = {
    storage: {
      local: {
        get: async keys => {
          if (keys === null) return { ...store };
          const list = typeof keys === 'string' ? [keys] : keys;
          const out = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        set: async obj => { Object.assign(store, obj); },
        clear: async () => { for (const k of Object.keys(store)) delete store[k]; },
        remove: async keys => {
          for (const k of (Array.isArray(keys) ? keys : [keys])) delete store[k];
        },
      },
    },
    runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    browserAction: { onClicked: { addListener() {} } },
    action: { onClicked: { addListener() {} } },
    cookies: { get: async () => null },
    tabs: { create() {} },
    webRequest: { onCompleted: { addListener() {} }, onBeforeRequest: { addListener() {} }, filterResponseData() {} },
    downloads: { download: async () => 1 },
  };
  global.Blob = class { constructor() {} };
  global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };
  return store;
}

// Evaluates background.js into an object exposing its top-level functions.
function loadBackground() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'nexus-addon', 'background.js'), 'utf8');
  const exports = [
    'processSurveyReports', 'processPirateReports', 'processMiningReports',
    'processExpeditionReports', 'processSystemDebris', 'rebuildAggregates',
    'checkDrift', 'ensureSchema', 'appendToArchive', 'loadArchive',
    'buildShipCatalog', 'extractFleet', 'numericResources', 'MIGRATIONS',
  ];
  // eslint-disable-next-line no-eval
  return eval(`${src}\n({ ${exports.join(', ')} })`);
}

module.exports = { SHIP_DEFS, makeBrowserStub, loadBackground };
