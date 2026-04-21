/**
 * Contract tests for the inline toolbar (replaced hamburger menu).
 *
 * Validates that:
 *   1. Tool launcher icon buttons exist with correct data-tool attributes
 *   2. Sidebar toggle buttons exist with correct IDs
 *   3. Theme flyout with per-theme options exists
 *   4. Mask PII and Share buttons exist with correct IDs
 *   5. Compiled CSS contains toolbar styling
 *   6. Old hamburger and FAB elements are fully removed
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Toolbar — html_content.dart', () => {
  let html: string;

  before(() => {
    html = readAsset('lib/src/server/html_content.dart');
  });

  // All tool launchers must be present as toolbar icon buttons.
  // `tables`, `search`, and `sql` joined this list when they stopped
  // being permanent tab-btn entries — they're now tb-icon-btn launchers
  // that openTool() materialises into closeable tabs on demand.
  const expectedTools = [
    'tables', 'search', 'sql',
    'snapshot', 'compare', 'index', 'size', 'perf',
    'anomaly', 'schema', 'diagram', 'import', 'export',
    'settings',
  ];

  for (const tool of expectedTools) {
    it(`contains data-tool="${tool}" toolbar button`, () => {
      assert.ok(
        html.includes(`data-tool="${tool}"`),
        `Toolbar must contain a data-tool="${tool}" icon button`,
      );
    });
  }

  it('contains left sidebar toggle with correct ID', () => {
    assert.ok(html.includes('id="tb-sidebar-toggle"'), 'Missing left sidebar toggle');
  });

  it('contains right history sidebar toggle with correct ID', () => {
    assert.ok(html.includes('id="tb-history-toggle"'), 'Missing history sidebar toggle');
  });

  it('contains theme flyout with per-theme options', () => {
    assert.ok(html.includes('id="tb-theme-trigger"'), 'Missing theme flyout trigger');
    assert.ok(html.includes('id="tb-theme-flyout"'), 'Missing theme flyout panel');
    assert.ok(html.includes('data-theme="light"'), 'Missing light theme option');
    assert.ok(html.includes('data-theme="dark"'), 'Missing dark theme option');
    assert.ok(html.includes('data-theme="showcase"'), 'Missing showcase theme option');
    assert.ok(html.includes('data-theme="midnight"'), 'Missing midnight theme option');
  });

  it('contains PII mask toggle with correct IDs', () => {
    assert.ok(html.includes('id="tb-mask-checkbox"'), 'Missing mask checkbox');
    assert.ok(html.includes('id="tb-mask-toggle"'), 'Missing mask toggle button');
  });

  it('contains share button with correct ID', () => {
    assert.ok(html.includes('id="tb-share-btn"'), 'Missing share button');
  });

  it('old hamburger elements are removed', () => {
    assert.ok(
      !html.includes('id="hamburger-trigger"'),
      'Old #hamburger-trigger must be removed',
    );
    assert.ok(
      !html.includes('id="hamburger-menu"'),
      'Old #hamburger-menu must be removed',
    );
    assert.ok(
      !html.includes('hamburger-wrapper'),
      'Old .hamburger-wrapper must be removed',
    );
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
  });
});

describe('Toolbar — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('toolbar icon button styles are present', () => {
    assert.ok(
      css.includes('.tb-icon-btn'),
      'Compiled CSS must contain .tb-icon-btn selector',
    );
  });

  it('toolbar divider styles are present', () => {
    assert.ok(
      css.includes('.tb-divider'),
      'Compiled CSS must contain .tb-divider selector',
    );
  });

  it('toolbar flyout styles are present', () => {
    assert.ok(
      css.includes('.tb-flyout'),
      'Compiled CSS must contain .tb-flyout selector',
    );
  });

  it('old hamburger styles are removed', () => {
    assert.ok(
      !css.includes('.hamburger-trigger'),
      'Old .hamburger-trigger CSS must be removed',
    );
    assert.ok(
      !css.includes('.hamburger-menu'),
      'Old .hamburger-menu CSS must be removed',
    );
  });
});

describe('Toolbar — bundle.js', () => {
  let js: string;

  before(() => {
    js = readAsset('assets/web/bundle.js');
  });

  it('initToolbar function is defined in bundle', () => {
    assert.ok(
      js.includes('function initToolbar'),
      'Bundle must contain initToolbar function',
    );
  });

  it('old initHamburgerMenu is not in bundle', () => {
    assert.ok(
      !js.includes('function initHamburgerMenu'),
      'Bundle must not contain old initHamburgerMenu function',
    );
  });
});
