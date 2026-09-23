// Single-executable entry: the exe is just a Node runtime; the real code stays
// on disk next to it (nexus-desktop/ + nexus-addon/) so background.js is the
// same file the Firefox addon ships. SEA cannot import() from disk, but
// require(esm) through createRequire can.
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.dirname(process.execPath);
createRequire(path.join(root, 'noop.js'))('./nexus-desktop/companion.mjs');
