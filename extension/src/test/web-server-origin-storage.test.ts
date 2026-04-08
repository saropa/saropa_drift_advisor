/**
 * Contract tests for the server-origin-aware localStorage clearing.
 *
 * When the user switches Flutter projects, the debug server host/port
 * changes. The webview HTML is reloaded (tested in panel.test.ts), but
 * VS Code webview localStorage is shared across panel instances. These
 * tests verify that the source code contains the wiring needed to detect
 * origin changes and purge stale project-specific keys so tables, pins,
 * nav history, SQL history, bookmarks, and analysis results from the
 * previous project do not bleed into the new one.
 *
 * What is tested:
 *  - state.ts declares the SERVER_ORIGIN_KEY constant
 *  - persistence.ts exports clearStaleProjectStorage
 *  - clearStaleProjectStorage reads the <base href> tag for the origin
 *  - clearStaleProjectStorage checks all project-specific key patterns
 *  - clearStaleProjectStorage preserves UI-preference keys (theme, sidebar)
 *  - app.js imports and calls clearStaleProjectStorage before table fetch
 *  - bundle.js contains the clearStaleProjectStorage call site
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('server-origin storage — state.ts constants', () => {
  let stateTs: string;

  before(() => {
    stateTs = readAsset('assets/web/state.ts');
  });

  it('declares SERVER_ORIGIN_KEY constant', () => {
    assert.ok(
      stateTs.includes("SERVER_ORIGIN_KEY = 'drift-viewer-server-origin'"),
      'state.ts should export SERVER_ORIGIN_KEY',
    );
  });

  it('SERVER_ORIGIN_KEY is grouped with other persistence keys', () => {
    // The constant should appear after the Persistence keys section header
    // and near the other localStorage key constants.
    const keysSection = stateTs.indexOf('// --- Persistence keys ---');
    const originKey = stateTs.indexOf('SERVER_ORIGIN_KEY');
    assert.ok(keysSection !== -1, 'Persistence keys section header should exist');
    assert.ok(originKey > keysSection, 'SERVER_ORIGIN_KEY should be in the persistence keys section');
  });
});

describe('server-origin storage — persistence.ts clearStaleProjectStorage', () => {
  let persistenceTs: string;

  before(() => {
    persistenceTs = readAsset('assets/web/persistence.ts');
  });

  it('exports clearStaleProjectStorage function', () => {
    assert.ok(
      persistenceTs.includes('export function clearStaleProjectStorage'),
      'persistence.ts should export clearStaleProjectStorage',
    );
  });

  it('reads origin from <base> tag', () => {
    // The extension injects a <base href="http://host:port/"> tag. The
    // function must read it to know the current server identity.
    assert.ok(
      persistenceTs.includes("document.querySelector('base')"),
      'clearStaleProjectStorage should read the <base> element',
    );
  });

  it('falls back to location.origin when no <base> tag', () => {
    assert.ok(
      persistenceTs.includes('location.origin'),
      'clearStaleProjectStorage should fall back to location.origin',
    );
  });

  it('compares against stored SERVER_ORIGIN_KEY', () => {
    assert.ok(
      persistenceTs.includes('S.SERVER_ORIGIN_KEY'),
      'clearStaleProjectStorage should reference SERVER_ORIGIN_KEY from state',
    );
  });

  it('clears PINNED_TABLES_KEY on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.PINNED_TABLES_KEY'),
      'clearStaleProjectStorage should target pinned tables key',
    );
  });

  it('clears NAV_HISTORY_KEY on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.NAV_HISTORY_KEY'),
      'clearStaleProjectStorage should target nav history key',
    );
  });

  it('clears SQL_HISTORY_KEY on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.SQL_HISTORY_KEY'),
      'clearStaleProjectStorage should target SQL history key',
    );
  });

  it('clears BOOKMARKS_KEY on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.BOOKMARKS_KEY'),
      'clearStaleProjectStorage should target bookmarks key',
    );
  });

  it('clears TABLE_STATE_KEY_PREFIX entries on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.TABLE_STATE_KEY_PREFIX'),
      'clearStaleProjectStorage should target per-table state keys',
    );
  });

  it('clears ANALYSIS_STORAGE_PREFIX entries on origin change', () => {
    assert.ok(
      persistenceTs.includes('S.ANALYSIS_STORAGE_PREFIX'),
      'clearStaleProjectStorage should target analysis storage keys',
    );
  });

  it('does NOT clear THEME_KEY (UI preference survives project switch)', () => {
    // The function body should NOT contain a condition that removes the
    // theme key. We verify by checking that THEME_KEY is not referenced
    // inside clearStaleProjectStorage itself.
    const funcStart = persistenceTs.indexOf('function clearStaleProjectStorage');
    const funcBody = persistenceTs.substring(funcStart, persistenceTs.indexOf('\nexport function', funcStart + 1));
    assert.ok(
      !funcBody.includes('THEME_KEY'),
      'clearStaleProjectStorage must NOT remove THEME_KEY',
    );
  });

  it('does NOT clear APP_SIDEBAR_PANEL_KEY (UI preference survives project switch)', () => {
    const funcStart = persistenceTs.indexOf('function clearStaleProjectStorage');
    const funcBody = persistenceTs.substring(funcStart, persistenceTs.indexOf('\nexport function', funcStart + 1));
    assert.ok(
      !funcBody.includes('APP_SIDEBAR_PANEL_KEY'),
      'clearStaleProjectStorage must NOT remove APP_SIDEBAR_PANEL_KEY',
    );
  });

  it('records the new origin after clearing', () => {
    assert.ok(
      persistenceTs.includes("localStorage.setItem(S.SERVER_ORIGIN_KEY, origin)"),
      'clearStaleProjectStorage should persist the new origin',
    );
  });

  it('wraps everything in try/catch for localStorage unavailability', () => {
    const funcStart = persistenceTs.indexOf('function clearStaleProjectStorage');
    const funcBody = persistenceTs.substring(funcStart, persistenceTs.indexOf('\nexport function', funcStart + 1));
    assert.ok(
      funcBody.includes('try {') && funcBody.includes('catch (e)'),
      'clearStaleProjectStorage should be wrapped in try/catch',
    );
  });
});

describe('server-origin storage — app.js wiring', () => {
  let appJs: string;

  before(() => {
    appJs = readAsset('assets/web/app.js');
  });

  it('imports clearStaleProjectStorage from persistence.ts', () => {
    assert.ok(
      appJs.includes('clearStaleProjectStorage'),
      'app.js should import clearStaleProjectStorage',
    );
    assert.ok(
      appJs.includes("from './persistence.ts'"),
      'app.js should import from persistence.ts',
    );
  });

  it('calls clearStaleProjectStorage before fetching /api/tables', () => {
    // The clear must run before any localStorage reads to prevent stale
    // data from being restored. Verify call order in the source.
    const clearPos = appJs.indexOf('clearStaleProjectStorage()');
    const fetchPos = appJs.indexOf("fetch('/api/tables'");
    assert.ok(clearPos !== -1, 'app.js should call clearStaleProjectStorage()');
    assert.ok(fetchPos !== -1, 'app.js should fetch /api/tables');
    assert.ok(
      clearPos < fetchPos,
      'clearStaleProjectStorage() must run before /api/tables fetch',
    );
  });
});

describe('server-origin storage — bundle integration', () => {
  let bundle: string;

  before(() => {
    bundle = readAsset('assets/web/bundle.js');
  });

  it('bundle.js contains clearStaleProjectStorage definition', () => {
    assert.ok(
      bundle.includes('function clearStaleProjectStorage'),
      'bundle should contain clearStaleProjectStorage definition',
    );
  });

  it('bundle.js contains clearStaleProjectStorage call site', () => {
    assert.ok(
      bundle.includes('clearStaleProjectStorage()'),
      'bundle should contain clearStaleProjectStorage invocation',
    );
  });

  it('bundle.js contains SERVER_ORIGIN_KEY value', () => {
    assert.ok(
      bundle.includes('drift-viewer-server-origin'),
      'bundle should contain the server origin localStorage key',
    );
  });

  it('bundle.js contains [SDA] server origin changed log', () => {
    assert.ok(
      bundle.includes('server origin changed'),
      'bundle should contain the diagnostic log for origin changes',
    );
  });
});
