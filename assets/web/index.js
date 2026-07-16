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
import { initWebL10n } from './l10n.ts';
import { highlightSql } from './sql-highlight.ts';
import { initMasthead } from './masthead.ts';

// Localization first: resolve the active locale and install any host/server-
// injected translation overlay (window.__SDA_L10N) BEFORE any module renders, so
// the first synchronous vt() call during DOMContentLoaded already sees the right
// catalog. Fail-soft to bundled English when no overlay is present (plan 75 §3.3).
console.log('[SDA] index.js bridge: initWebL10n()');
initWebL10n();

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
import { initToolbar } from './toolbar.ts';
import { initTableDefToggle } from './table-def-toggle.ts';
import { initTableDefMeta } from './table-def-meta.ts';
import { initSettings } from './settings.ts';
import { initHeartbeatScreen } from './heartbeat-screen.ts';

console.log('[SDA] index.js bridge: calling initToolbar()');
initToolbar();
console.log('[SDA] index.js bridge: calling initTableDefToggle()');
initTableDefToggle();
console.log('[SDA] index.js bridge: calling initTableDefMeta()');
initTableDefMeta();
console.log('[SDA] index.js bridge: calling initSettings()');
initSettings();
// Heartbeat screen: self-contained — activates via the 'sda-tab-switch'
// event tabs.ts dispatches, so no app.js onTabSwitch wiring is needed.
console.log('[SDA] index.js bridge: calling initHeartbeatScreen()');
initHeartbeatScreen();
console.log('[SDA] index.js bridge: init complete');
