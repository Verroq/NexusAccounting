'use strict';
// Shared test fixtures and the browser-API stub used to run background.js
// under node.

const fs = require('fs');
const path = require('path');

// Real ship stats from the in-game ship screens (Stats.txt, 2026-06-22).
const SHIP_DEFS = {
  scout:           { key: 'scout',           name: 'Scout',           hp: 100,    shieldHp: 25,    attack: 15,   weaponType: 'kinetic', armorType: 'light',    shipSize: 'small',  costOre: 194,    costSilicates: 97,     costHydrogen: 0,      costAlloys: 20    },
  fighter:         { key: 'fighter',         name: 'Fighter',         hp: 250,    shieldHp: 60,    attack: 30,   weaponType: 'laser',   armorType: 'light',    shipSize: 'small',  costOre: 485,    costSilicates: 243,    costHydrogen: 49,     costAlloys: 97    },
  interceptor:     { key: 'interceptor',     name: 'Interceptor',     hp: 200,    shieldHp: 50,    attack: 35,   weaponType: 'kinetic', armorType: 'light',    shipSize: 'small',  costOre: 873,    costSilicates: 485,    costHydrogen: 194,    costAlloys: 194   },
  bomber:          { key: 'bomber',          name: 'Bomber',          hp: 650,    shieldHp: 150,   attack: 120,  weaponType: 'missile', armorType: 'heavy',    shipSize: 'large',  costOre: 2910,   costSilicates: 1940,   costHydrogen: 970,    costAlloys: 485   },
  cruiser:         { key: 'cruiser',         name: 'Cruiser',         hp: 700,    shieldHp: 200,   attack: 65,   weaponType: 'laser',   armorType: 'medium',   shipSize: 'medium', costOre: 1940,   costSilicates: 970,    costHydrogen: 485,    costAlloys: 243   },
  battleship:      { key: 'battleship',      name: 'Battleship',      hp: 1500,   shieldHp: 500,   attack: 90,   weaponType: 'plasma',  armorType: 'heavy',    shipSize: 'large',  costOre: 5820,   costSilicates: 3395,   costHydrogen: 1746,   costAlloys: 679   },
  missile_cruiser: { key: 'missile_cruiser', name: 'Missile Cruiser', hp: 1000,   shieldHp: 300,   attack: 70,   weaponType: 'missile', armorType: 'heavy',    shipSize: 'medium', costOre: 3104,   costSilicates: 1552,   costHydrogen: 776,    costAlloys: 388   },
  carrier:         { key: 'carrier',         name: 'Carrier',         hp: 2000,   shieldHp: 600,   attack: 30,   weaponType: 'laser',   armorType: 'heavy',    shipSize: 'large',  costOre: 3880,   costSilicates: 2425,   costHydrogen: 970,    costAlloys: 340   },
  torpedo_frigate: { key: 'torpedo_frigate', name: 'Torpedo Frigate', hp: 180,    shieldHp: 40,    attack: 55,   weaponType: 'missile', armorType: 'light',    shipSize: 'small',  costOre: 1164,   costSilicates: 679,    costHydrogen: 388,    costAlloys: 291   },
  dreadnought:     { key: 'dreadnought',     name: 'Dreadnought',     hp: 20000,  shieldHp: 8000,  attack: 800,  weaponType: 'ion',     armorType: 'heavy',    shipSize: 'huge',   costOre: 145500, costSilicates: 97000,  costHydrogen: 58200,  costAlloys: 38800 },
  titan:           { key: 'titan',           name: 'Titan',           hp: 200000, shieldHp: 60000, attack: 5000, weaponType: 'ion',     armorType: 'shielded', shipSize: 'huge',   costOre: 1940000, costSilicates: 1455000, costHydrogen: 727500, costAlloys: 727500 },
  gas_collector:            { key: 'gas_collector',            name: 'Gas Collector',            hp: 250,  shieldHp: 60,  attack: 0,   weaponType: null,  armorType: 'light',  shipSize: 'large',  costOre: 485,   costSilicates: 388,   costHydrogen: 194,  costAlloys: 97  },
  electronic_warfare_ship:  { key: 'electronic_warfare_ship',  name: 'Electronic Warfare Ship',  hp: 400,  shieldHp: 80,  attack: 10,  weaponType: 'ion', armorType: 'medium', shipSize: 'medium', costOre: 1455,  costSilicates: 1940,  costHydrogen: 776,  costAlloys: 291 },
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
    'systemFromLocation', 'resolveZone', 'backfillZones', 'processMissions',
  ];
  // eslint-disable-next-line no-eval
  return eval(`${src}\n({ ${exports.join(', ')} })`);
}

module.exports = { SHIP_DEFS, makeBrowserStub, loadBackground };
