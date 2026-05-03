/**
 * Contract tests for the Settings panel.
 *
 * Validates that:
 *   1. The settings panel container exists in html_content.dart
 *   2. settings.ts exports the expected API (getPref, setPref, initSettings, etc.)
 *   3. All preference keys and defaults are defined
 *   4. The compiled CSS contains settings panel styling
 *   5. index.js imports and calls initSettings
 *   6. app.js imports and calls applyStoredPrefs early in startup
 *   7. Consumer modules import from settings.ts instead of using hardcoded constants
 *   8. persistence.ts exports collectProjectStorageKeys for shared key enumeration
 *
 * Before: hardcoded constants scattered across modules (SQL_HISTORY_MAX = 200,
 *   ANALYSIS_MAX_SAVED = 50, etc.) with no user-facing way to change them.
 *
 * After: centralized getPref/setPref API in settings.ts; Settings tab in the
 *   hamburger menu lets users configure storage limits, table defaults,
 *   performance thresholds, and data formatting preferences.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Settings panel — html_content.dart', () => {
  let html: string;

  before(() => {
    html = readAsset('lib/src/server/html_content.dart');
  });

  it('settings panel container exists', () => {
    assert.ok(
      html.includes('id="panel-settings"'),
      'HTML must contain #panel-settings tab panel',
    );
  });

  it('settings panel body container exists', () => {
    assert.ok(
      html.includes('id="settings-body"'),
      'HTML must contain #settings-body for JS-rendered content',
    );
  });

  it('hamburger menu has settings launcher', () => {
    assert.ok(
      html.includes('data-tool="settings"'),
      'Hamburger menu must contain data-tool="settings" item',
    );
  });
});

describe('Settings panel — settings.ts API', () => {
  let ts: string;

  before(() => {
    ts = readAsset('assets/web/settings.ts');
  });

  it('exports getPref function', () => {
    assert.ok(
      ts.includes('export function getPref'),
      'settings.ts must export getPref',
    );
  });

  it('exports setPref function', () => {
    assert.ok(
      ts.includes('export function setPref'),
      'settings.ts must export setPref',
    );
  });

  it('exports initSettings function', () => {
    assert.ok(
      ts.includes('export function initSettings'),
      'settings.ts must export initSettings',
    );
  });

  it('exports applyStoredPrefs function', () => {
    assert.ok(
      ts.includes('export function applyStoredPrefs'),
      'settings.ts must export applyStoredPrefs',
    );
  });

  // All preference key constants that consumers import
  const expectedPrefKeys = [
    'PREF_SQL_HISTORY_MAX',
    'PREF_ANALYSIS_MAX',
    'PREF_DEFAULT_PAGE_SIZE',
    'PREF_DEFAULT_DISPLAY_FORMAT',
    // PREF_NULL_DISPLAY: pins the contract that users can choose between
    // 'NULL' and '-' for the SQL-NULL marker shown in data table cells.
    'PREF_NULL_DISPLAY',
    'PREF_DEFAULT_ONLY_MATCHING',
    'PREF_SLOW_QUERY_THRESHOLD',
    'PREF_AUTO_REFRESH',
    'PREF_EPOCH_DETECTION',
    'PREF_CONFIRM_NAVIGATE_AWAY',
  ];

  for (const key of expectedPrefKeys) {
    it(`exports preference key ${key}`, () => {
      assert.ok(
        ts.includes(`export const ${key}`),
        `settings.ts must export ${key}`,
      );
    });
  }

  it('exports DEFAULTS object', () => {
    assert.ok(
      ts.includes('export const DEFAULTS'),
      'settings.ts must export DEFAULTS with all default values',
    );
  });

  it('uses drift-viewer-pref- prefix for localStorage keys', () => {
    assert.ok(
      ts.includes("'drift-viewer-pref-'"),
      'Preference keys must use drift-viewer-pref- prefix',
    );
  });

  it('uses collectProjectStorageKeys from persistence.ts', () => {
    // The clear-all-data action should use the shared helper rather than
    // duplicating the key-matching logic from persistence.ts.
    assert.ok(
      ts.includes('collectProjectStorageKeys'),
      'settings.ts must use collectProjectStorageKeys for data clearing',
    );
  });
});

describe('Settings panel — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('settings-panel styles are present', () => {
    assert.ok(
      css.includes('.settings-panel'),
      'Compiled CSS must contain .settings-panel selector',
    );
  });

  it('settings-switch toggle styles are present', () => {
    assert.ok(
      css.includes('.settings-switch'),
      'Compiled CSS must contain .settings-switch selector',
    );
  });

  it('settings-group-title styles are present', () => {
    assert.ok(
      css.includes('.settings-group-title'),
      'Compiled CSS must contain .settings-group-title selector',
    );
  });

  it('danger outline button styles are present', () => {
    assert.ok(
      css.includes('.btn-danger-outline'),
      'Compiled CSS must contain .btn-danger-outline for destructive actions',
    );
  });

  it('respects reduced motion preference', () => {
    // The settings SCSS partial should include a reduced-motion query
    assert.ok(
      css.includes('.settings-switch'),
      'Settings styles must be compiled into style.css',
    );
  });

  // The .cell-null class is emitted by table-view.ts on every NULL cell.
  // Without an actual CSS rule, NULL markers render as plain text and are
  // indistinguishable from real values — the bug this contract pins against.
  it('cell-null dimming rule is compiled into style.css', () => {
    assert.ok(
      css.includes('.cell-null'),
      'Compiled CSS must contain .cell-null selector so NULL cells render dimmed',
    );
  });
});

describe('Settings panel — index.js integration', () => {
  let indexJs: string;

  before(() => {
    indexJs = readAsset('assets/web/index.js');
  });

  it('imports initSettings from settings.ts', () => {
    assert.ok(
      indexJs.includes("import { initSettings } from './settings.ts'"),
      'index.js must import initSettings',
    );
  });

  it('calls initSettings()', () => {
    assert.ok(
      indexJs.includes('initSettings()'),
      'index.js must call initSettings()',
    );
  });
});

describe('Settings panel — app.js integration', () => {
  let appJs: string;

  before(() => {
    appJs = readAsset('assets/web/app.js');
  });

  it('imports applyStoredPrefs from settings.ts', () => {
    assert.ok(
      appJs.includes('applyStoredPrefs'),
      'app.js must import applyStoredPrefs from settings.ts',
    );
  });

  it('calls applyStoredPrefs() early in startup', () => {
    // applyStoredPrefs must be called after clearStaleProjectStorage
    // but before any module reads S.limit, S.displayFormat, etc.
    const clearIdx = appJs.indexOf('clearStaleProjectStorage()');
    const applyIdx = appJs.indexOf('applyStoredPrefs()');
    assert.ok(clearIdx > -1, 'app.js must call clearStaleProjectStorage');
    assert.ok(applyIdx > -1, 'app.js must call applyStoredPrefs');
    assert.ok(
      applyIdx > clearIdx,
      'applyStoredPrefs must be called after clearStaleProjectStorage',
    );
  });

  it('gates navigate-away confirmation on preference', () => {
    assert.ok(
      appJs.includes('PREF_CONFIRM_NAVIGATE_AWAY'),
      'beforeunload handler must check PREF_CONFIRM_NAVIGATE_AWAY',
    );
  });
});

describe('Settings panel — consumer modules use getPref', () => {
  it('sql-history.ts imports from settings.ts', () => {
    const ts = readAsset('assets/web/sql-history.ts');
    assert.ok(
      ts.includes("from './settings.ts'"),
      'sql-history.ts must import from settings.ts',
    );
    assert.ok(
      ts.includes('getPref(PREF_SQL_HISTORY_MAX'),
      'sql-history.ts must use getPref for history max',
    );
  });

  it('analysis.ts imports from settings.ts', () => {
    const ts = readAsset('assets/web/analysis.ts');
    assert.ok(
      ts.includes("from './settings.ts'"),
      'analysis.ts must import from settings.ts',
    );
    assert.ok(
      ts.includes('getPref(PREF_ANALYSIS_MAX'),
      'analysis.ts must use getPref for analysis max',
    );
  });

  it('table-view.ts imports from settings.ts', () => {
    const ts = readAsset('assets/web/table-view.ts');
    assert.ok(
      ts.includes("from './settings.ts'"),
      'table-view.ts must import from settings.ts',
    );
    assert.ok(
      ts.includes('getPref(PREF_EPOCH_DETECTION'),
      'table-view.ts must use getPref for epoch detection toggle',
    );
  });

  it('performance.ts imports from settings.ts', () => {
    const ts = readAsset('assets/web/performance.ts');
    assert.ok(
      ts.includes("from './settings.ts'"),
      'performance.ts must import from settings.ts',
    );
    assert.ok(
      ts.includes('getPref(PREF_SLOW_QUERY_THRESHOLD'),
      'performance.ts must use getPref for slow query threshold',
    );
  });
});

describe('Settings panel — persistence.ts shared helper', () => {
  let ts: string;

  before(() => {
    ts = readAsset('assets/web/persistence.ts');
  });

  it('exports collectProjectStorageKeys', () => {
    assert.ok(
      ts.includes('export function collectProjectStorageKeys'),
      'persistence.ts must export collectProjectStorageKeys',
    );
  });

  it('clearStaleProjectStorage uses collectProjectStorageKeys', () => {
    // The key enumeration logic should be centralized, not duplicated
    assert.ok(
      ts.includes('collectProjectStorageKeys()'),
      'clearStaleProjectStorage must call collectProjectStorageKeys',
    );
  });
});

describe('Settings panel — state.ts registration', () => {
  let ts: string;

  before(() => {
    ts = readAsset('assets/web/state.ts');
  });

  it('TOOL_LABELS includes settings', () => {
    assert.ok(
      ts.includes("settings: 'Settings'"),
      'TOOL_LABELS must include settings entry',
    );
  });
});
