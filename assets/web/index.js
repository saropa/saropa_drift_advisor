/**
 * Entry point for esbuild bundling.
 *
 * Import order matters: producers (sqlHighlight, mastheadStatus) must
 * run before the consumer (app.js). Self-contained modules (hamburger-menu,
 * table-def-toggle) go last since they only need the DOM.
 *
 * The TS modules export clean APIs. The window.* bridge below keeps
 * app.js working until it is modularised in a future migration.
 */
import { highlightSql } from './sql-highlight.ts';
import { initMasthead } from './masthead.ts';

// Bridge: app.js reads window.sqlHighlight and window.mastheadStatus.
console.log('[SDA] index.js bridge: setting window.sqlHighlight');
window.sqlHighlight = highlightSql;
console.log('[SDA] index.js bridge: calling initMasthead()');
const api = initMasthead();
console.log('[SDA] index.js bridge: initMasthead returned ' + (api ? 'API object' : 'null'));
if (api) window.mastheadStatus = api;

// app.js — the main monolith (still plain JS, reads window.* globals).
import './app.js';

// Self-contained modules that only need the DOM to be ready.
import { initHamburgerMenu } from './hamburger-menu.ts';
import { initTableDefToggle } from './table-def-toggle.ts';

console.log('[SDA] index.js bridge: calling initHamburgerMenu()');
initHamburgerMenu();
console.log('[SDA] index.js bridge: calling initTableDefToggle()');
initTableDefToggle();
console.log('[SDA] index.js bridge: init complete');
