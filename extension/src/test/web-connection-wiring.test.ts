/**
 * Contract tests for the connection wiring across web modules.
 *
 * Verifies that:
 *  - connection.ts exposes initConnectionDeps and the dependency
 *    injection stubs are present
 *  - app.js calls initConnectionDeps with both required callbacks
 *  - app.js wires the onToggle handler via setTimeout(0) for the
 *    masthead pill click
 *  - app.js fetches /api/change-detection on page load
 *  - table-list.ts exports pollGeneration (injected via initConnectionDeps)
 *  - index.js bridge sets window.mastheadStatus before app.js callbacks fire
 *  - masthead.ts exposes onToggle in the MastheadStatus interface
 *  - bundle.js contains the wired initConnectionDeps call (not just
 *    the no-op default)
 *
 * These are static source-level contract tests — they read the TS/JS
 * source and check that the wiring patterns are present. They catch
 * regressions where a refactor accidentally drops a call site.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('connection wiring — initConnectionDeps contract', () => {
  let connectionTs: string;
  let appJs: string;
  let tableListTs: string;

  before(() => {
    connectionTs = readAsset('assets/web/connection.ts');
    appJs = readAsset('assets/web/app.js');
    tableListTs = readAsset('assets/web/table-list.ts');
  });

  it('connection.ts exports initConnectionDeps', () => {
    assert.ok(
      connectionTs.includes('export function initConnectionDeps'),
      'connection.ts should export initConnectionDeps',
    );
  });

  it('connection.ts declares _pollGeneration stub', () => {
    assert.ok(
      connectionTs.includes('let _pollGeneration'),
      'connection.ts should declare _pollGeneration injection point',
    );
  });

  it('connection.ts declares _applyHealthWriteFlag stub', () => {
    assert.ok(
      connectionTs.includes('let _applyHealthWriteFlag'),
      'connection.ts should declare _applyHealthWriteFlag injection point',
    );
  });

  it('connection.ts calls _pollGeneration in doHeartbeat success path', () => {
    assert.ok(
      connectionTs.includes('_pollGeneration()'),
      'doHeartbeat should call _pollGeneration on health OK',
    );
  });

  it('app.js imports initConnectionDeps', () => {
    assert.ok(
      appJs.includes('initConnectionDeps'),
      'app.js should import initConnectionDeps from connection.ts',
    );
  });

  it('app.js calls initConnectionDeps with both callbacks', () => {
    assert.ok(
      appJs.includes('initConnectionDeps({'),
      'app.js should call initConnectionDeps',
    );
    assert.ok(
      appJs.includes('applyHealthWriteFlag: applyHealthWriteFlag'),
      'app.js should pass applyHealthWriteFlag',
    );
    assert.ok(
      appJs.includes('pollGeneration: pollGeneration'),
      'app.js should pass pollGeneration',
    );
  });

  it('table-list.ts exports pollGeneration', () => {
    assert.ok(
      tableListTs.includes('export function pollGeneration'),
      'table-list.ts should export pollGeneration for injection',
    );
  });
});

describe('connection wiring — polling toggle contract', () => {
  let appJs: string;
  let mastheadTs: string;
  let indexJs: string;

  before(() => {
    appJs = readAsset('assets/web/app.js');
    mastheadTs = readAsset('assets/web/masthead.ts');
    indexJs = readAsset('assets/web/index.js');
  });

  it('app.js fetches /api/change-detection on page load', () => {
    assert.ok(
      appJs.includes("fetch('/api/change-detection'"),
      'app.js should GET /api/change-detection for initial polling state',
    );
  });

  it('app.js wires onToggle via setTimeout(0)', () => {
    assert.ok(
      appJs.includes('setTimeout(function()'),
      'app.js should defer onToggle wiring with setTimeout(0)',
    );
    assert.ok(
      appJs.includes('mastheadStatus.onToggle'),
      'app.js should assign onToggle callback on mastheadStatus',
    );
  });

  it('app.js POSTs to /api/change-detection in onToggle handler', () => {
    assert.ok(
      appJs.includes("method: 'POST'"),
      'onToggle handler should POST to toggle polling',
    );
    assert.ok(
      appJs.includes('startKeepAlive()'),
      'onToggle handler should call startKeepAlive when polling disabled',
    );
    assert.ok(
      appJs.includes('stopKeepAlive()'),
      'onToggle handler should call stopKeepAlive when polling enabled',
    );
  });

  it('masthead.ts interface includes onToggle', () => {
    assert.ok(
      mastheadTs.includes('onToggle: Function | null'),
      'MastheadStatus interface should declare onToggle callback',
    );
  });

  it('masthead.ts checks onToggle before calling', () => {
    assert.ok(
      mastheadTs.includes("typeof api.onToggle === 'function'"),
      'click handler should guard onToggle call with type check',
    );
  });

  it('index.js sets window.mastheadStatus from initMasthead()', () => {
    assert.ok(
      indexJs.includes('window.mastheadStatus = api'),
      'index.js should set window.mastheadStatus',
    );
  });
});

describe('connection wiring — bundle integration', () => {
  let bundle: string;

  before(() => {
    bundle = readAsset('assets/web/bundle.js');
  });

  it('bundle.js contains initConnectionDeps call (not just definition)', () => {
    // The definition is "function initConnectionDeps(deps)".
    // The call site is "initConnectionDeps({" — both must be present.
    const defCount = (bundle.match(/function initConnectionDeps/g) || []).length;
    const callCount = (bundle.match(/initConnectionDeps\(\{/g) || []).length;
    assert.ok(defCount >= 1, 'bundle should contain initConnectionDeps definition');
    assert.ok(callCount >= 1, 'bundle should contain initConnectionDeps call site');
  });

  it('bundle.js contains /api/change-detection fetch', () => {
    assert.ok(
      bundle.includes('/api/change-detection'),
      'bundle should contain change-detection endpoint reference',
    );
  });

  it('bundle.js contains onToggle assignment', () => {
    assert.ok(
      bundle.includes('.onToggle = function'),
      'bundle should contain onToggle callback assignment',
    );
  });

  it('bundle.js contains [SDA] diagnostic logging', () => {
    assert.ok(
      bundle.includes('[SDA]'),
      'bundle should contain [SDA] diagnostic log prefix',
    );
  });
});
