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
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
  },
  { rules: { 'no-unused-vars': 'warn' } },
  { ignores: ['nexus-addon/chart.umd.js', 'nexus-addon/browser-polyfill.js'] },
];
