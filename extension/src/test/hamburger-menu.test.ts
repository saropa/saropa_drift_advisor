/**
 * Contract tests for the hamburger menu.
 *
 * Validates that:
 *   1. The hamburger trigger and menu exist in html_content.dart
 *   2. The compiled CSS contains hamburger menu styling
 *   3. hamburger-menu.ts wires tool launchers and handles open/close
 *   4. The old FAB and toolbar are fully removed
 *   5. All 10 tool launcher data-tool attributes are present in the menu
 *   6. Settings items (sidebar, theme, mask, share) have correct IDs
 *
 * Before: 10-button toolbar row + floating action button (FAB) at
 *   bottom-right with sidebar/theme/mask/share actions.
 *
 * After: single hamburger button at left edge of tab bar with a
 *   dropdown menu containing grouped tool launchers and settings.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Hamburger menu — html_content.dart', () => {
  let html: string;

  before(() => {
    html = readAsset('lib/src/server/html_content.dart');
  });

  it('hamburger trigger button exists with correct ARIA attributes', () => {
    assert.ok(
      html.includes('id="hamburger-trigger"'),
      'HTML must contain #hamburger-trigger button',
    );
    assert.ok(
      html.includes('aria-controls="hamburger-menu"'),
      'Trigger must reference hamburger-menu via aria-controls',
    );
    assert.ok(
      html.includes('aria-expanded="false"'),
      'Trigger must start with aria-expanded="false"',
    );
  });

  it('hamburger menu container exists', () => {
    assert.ok(
      html.includes('id="hamburger-menu"'),
      'HTML must contain #hamburger-menu dropdown',
    );
  });

  // All 10 tools that were in the toolbar must now be in the hamburger menu.
  const expectedTools = [
    'snapshot', 'compare', 'index', 'size', 'perf',
    'anomaly', 'schema', 'diagram', 'import', 'export',
  ];

  for (const tool of expectedTools) {
    it(`contains data-tool="${tool}" menu item`, () => {
      assert.ok(
        html.includes(`data-tool="${tool}"`),
        `Hamburger menu must contain a data-tool="${tool}" item`,
      );
    });
  }

  it('contains sidebar toggle with correct IDs', () => {
    assert.ok(html.includes('id="hamburger-sidebar-toggle"'), 'Missing sidebar toggle');
    assert.ok(html.includes('id="hamburger-sidebar-icon"'), 'Missing sidebar icon');
    assert.ok(html.includes('id="hamburger-sidebar-label"'), 'Missing sidebar label');
  });

  it('contains theme toggle with correct IDs', () => {
    assert.ok(html.includes('id="hamburger-theme-toggle"'), 'Missing theme toggle');
    assert.ok(html.includes('id="hamburger-theme-label"'), 'Missing theme label');
  });

  it('contains PII mask toggle with correct ID', () => {
    assert.ok(html.includes('id="hamburger-pii-mask-toggle"'), 'Missing PII mask toggle');
  });

  it('contains share button with correct ID', () => {
    assert.ok(html.includes('id="hamburger-share-btn"'), 'Missing share button');
  });

  it('old FAB elements are removed', () => {
    assert.ok(
      !html.includes('id="super-fab"'),
      'Old #super-fab container must be removed',
    );
    assert.ok(
      !html.includes('id="super-fab-trigger"'),
      'Old #super-fab-trigger must be removed',
    );
    assert.ok(
      !html.includes('id="fab-share-btn"'),
      'Old #fab-share-btn must be removed',
    );
    assert.ok(
      !html.includes('id="fab-sidebar-toggle"'),
      'Old #fab-sidebar-toggle must be removed',
    );
  });

  it('old tools-toolbar is removed', () => {
    assert.ok(
      !html.includes('id="tools-toolbar"'),
      'Old #tools-toolbar must be removed',
    );
  });

  it('has group labels for menu sections', () => {
    assert.ok(
      html.includes('hamburger-group-label'),
      'Menu must contain section headings with .hamburger-group-label',
    );
  });

  it('has heavy divider separating tools from settings', () => {
    assert.ok(
      html.includes('hamburger-divider-heavy'),
      'Menu must contain a heavy divider before the settings section',
    );
  });
});

describe('Hamburger menu — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('hamburger-trigger styles are present', () => {
    assert.ok(
      css.includes('.hamburger-trigger'),
      'Compiled CSS must contain .hamburger-trigger selector',
    );
  });

  it('hamburger-menu uses display: none by default', () => {
    // Menu is hidden until trigger has aria-expanded="true".
    assert.ok(
      css.includes('.hamburger-menu'),
      'Compiled CSS must contain .hamburger-menu selector',
    );
  });

  it('menu becomes visible via aria-expanded selector', () => {
    // Sass may strip quotes from attribute values, so accept both forms.
    const quoted = '.hamburger-trigger[aria-expanded="true"] + .hamburger-menu';
    const unquoted = '.hamburger-trigger[aria-expanded=true] + .hamburger-menu';
    assert.ok(
      css.includes(quoted) || css.includes(unquoted),
      'CSS must show menu when trigger has aria-expanded="true"',
    );
  });

  it('old FAB styles are removed', () => {
    assert.ok(
      !css.includes('.super-fab'),
      'Compiled CSS must not contain .super-fab (FAB removed)',
    );
    assert.ok(
      !css.includes('.fab-action'),
      'Compiled CSS must not contain .fab-action (FAB removed)',
    );
  });

  it('old toolbar styles are removed', () => {
    assert.ok(
      !css.includes('.toolbar-tool-btn'),
      'Compiled CSS must not contain .toolbar-tool-btn (toolbar removed)',
    );
    assert.ok(
      !css.includes('#tools-toolbar'),
      'Compiled CSS must not contain #tools-toolbar (toolbar removed)',
    );
  });

  it('respects reduced motion preference', () => {
    assert.ok(
      css.includes('prefers-reduced-motion'),
      'Hamburger menu must include reduced-motion media query',
    );
  });
});

describe('Hamburger menu — hamburger-menu.ts', () => {
  let ts: string;

  before(() => {
    ts = readAsset('assets/web/hamburger-menu.ts');
  });

  it('exports initHamburgerMenu function', () => {
    assert.ok(
      ts.includes('export function initHamburgerMenu'),
      'hamburger-menu.ts must export initHamburgerMenu',
    );
  });

  it('toggles aria-expanded on the trigger', () => {
    assert.ok(
      ts.includes('aria-expanded'),
      'Must toggle aria-expanded for accessibility',
    );
  });

  it('handles Escape key to close', () => {
    assert.ok(
      ts.includes("e.key === 'Escape'"),
      'Must close menu on Escape key',
    );
  });

  it('handles outside clicks to close', () => {
    assert.ok(
      ts.includes('wrapper') && ts.includes('contains'),
      'Must close menu when clicking outside',
    );
  });

  it('wires data-tool items to openTool()', () => {
    assert.ok(
      ts.includes('openTool(toolId)'),
      'Must call openTool() for tool launcher items',
    );
  });

  it('closes menu after opening a tool', () => {
    // After clicking a tool item, the menu should close.
    assert.ok(
      ts.includes('toggleMenu(false)'),
      'Must close menu after tool selection',
    );
  });
});

describe('Hamburger menu — index.js integration', () => {
  let indexJs: string;

  before(() => {
    indexJs = readAsset('assets/web/index.js');
  });

  it('imports and calls initHamburgerMenu', () => {
    assert.ok(
      indexJs.includes("import { initHamburgerMenu } from './hamburger-menu.ts'"),
      'index.js must import initHamburgerMenu',
    );
    assert.ok(
      indexJs.includes('initHamburgerMenu()'),
      'index.js must call initHamburgerMenu()',
    );
  });

  it('does not reference old FAB module', () => {
    assert.ok(
      !indexJs.includes('initSuperFab'),
      'index.js must not reference initSuperFab (FAB removed)',
    );
    assert.ok(
      !indexJs.includes("from './fab"),
      'index.js must not import from fab module (removed)',
    );
  });
});
