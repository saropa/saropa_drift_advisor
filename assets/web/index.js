/**
 * Entry point for esbuild bundling.
 *
 * Import order matters: producers (sqlHighlight, mastheadStatus) must
 * run before the consumer (app.js). Self-contained modules (fab,
 * table-def-toggle) go last since they only need the DOM.
 *
 * The TS modules export clean APIs. The window.* bridge below keeps
 * app.js working until it is modularised in a future migration.
 */
import { highlightSql } from './sql-highlight.ts';
import { initMasthead } from './masthead.ts';

// Bridge: app.js reads window.sqlHighlight and window.mastheadStatus.
window.sqlHighlight = highlightSql;
const api = initMasthead();
if (api) window.mastheadStatus = api;

// app.js — the main monolith (still plain JS, reads window.* globals).
import './app.js';

// Self-contained modules that only need the DOM to be ready.
import { initSuperFab } from './fab.ts';
import { initTableDefToggle } from './table-def-toggle.ts';

initSuperFab();
initTableDefToggle();
