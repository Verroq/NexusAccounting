const js = require('@eslint/js');
const globals = require('globals');

// Browser-extension scripts share one global scope across <script> tags, so
// symbols defined in one file are referenced (and a few reassigned) from
// siblings. ESLint has no cross-file resolution, so they're declared here.
// Regenerate after adding shared globals:  npx eslint . (read the no-undef list)
const sharedGlobals = {
  shipDefs: 'writable', fmt: 'readonly', updateFleetStats: 'readonly',
  runSimulations: 'readonly', lossesToResources: 'readonly', computeMods: 'readonly',
  setShipDefs: 'readonly', simulateOnce: 'readonly', Chart: 'readonly',
  NO_MODS: 'readonly', TECHS: 'readonly', TECH_MAX_LEVEL: 'readonly',
  EXTRA_RES_KEYS_UI: 'readonly', PER_PAGE: 'readonly', RARE_WEIGHT: 'readonly',
  RESOURCE_SERIES: 'readonly', RESOURCE_WEIGHTS: 'readonly', SCALE_OPTS: 'readonly',
  SERIES_GETTERS: 'readonly', importScripts: 'readonly', module: 'writable',
  _resolvedDistanceAU: 'writable', activeTab: 'writable', currentPage: 'writable',
  expPage: 'writable', miningPage: 'writable', pirateCurrentPage: 'writable',
  store: 'writable', latestBucket: 'writable',
  appendExtraResourceCards: 'readonly', applySort: 'readonly', attachSortable: 'readonly',
  combinedLost: 'readonly', computeEventBreakdown: 'readonly', computeResourcesLost: 'readonly',
  computeSeries: 'readonly', emptyResources: 'readonly', fillResourceCards: 'readonly',
  filterZone: 'readonly', fuelForMode: 'readonly', getEventBreakdownForMode: 'readonly',
  getLabelKey: 'readonly', getMode: 'readonly', getResourcesLostForMode: 'readonly',
  getSeriesForMode: 'readonly', getTotalsForMode: 'readonly', getZone: 'readonly',
  initFinderTab: 'readonly', isUnfiltered: 'readonly', loadAll: 'readonly',
  loadIntelReports: 'readonly', makeResourceDoughnut: 'readonly', makeResourceLineChart: 'readonly',
  makeStatCard: 'readonly', periodLabelFor: 'readonly', populateEventOptions: 'readonly',
  populatePlanetPicker: 'readonly', recordsForMode: 'readonly', renderByEventChart: 'readonly',
  renderCollected: 'readonly', renderDebrisTab: 'readonly', renderEventsChart: 'readonly',
  renderExpeditionsTab: 'readonly', renderGlobalTab: 'readonly', renderLost: 'readonly',
  renderLostCards: 'readonly', renderMiningTab: 'readonly', renderNetCards: 'readonly',
  renderPagedTable: 'readonly', renderPiratesTab: 'readonly', renderResourceChart: 'readonly',
  renderTable: 'readonly', renderTechTreeTab: 'readonly', resourceVal: 'readonly',
  updateDistanceFromCoords: 'readonly', zeroCell: 'readonly', zoneCell: 'readonly',
};

module.exports = [
  js.configs.recommended,
  {
    files: ['nexus-addon/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, ...sharedGlobals },
    },
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  { rules: { 'no-unused-vars': 'warn' } },
  { ignores: ['nexus-addon/chart.umd.js', 'nexus-addon/browser-polyfill.js'] },
];
