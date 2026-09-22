import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // Addon source: ES modules with explicit imports. `browser` comes from the
    // webextension polyfill / native API; `Chart` from chart.umd.js (a classic
    // <script> loaded before the module entry on the dashboard page).
    files: ['nexus-addon/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions, Chart: 'readonly' },
    },
  },
  {
    // Steam companion: Node (process, timers, fetch, WebSocket, …). `.cjs` is
    // the single-exe entry point, so it is CommonJS.
    files: ['nexus-desktop/**/*.mjs', 'nexus-desktop/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['nexus-desktop/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // Injected into the game's page over CDP, so it runs with browser globals.
    files: ['nexus-desktop/page-shim.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, browser: 'readonly' } },
  },
  { rules: { 'no-unused-vars': 'warn' } },
  { ignores: ['nexus-addon/chart.umd.js', 'nexus-addon/browser-polyfill.js'] },
];
