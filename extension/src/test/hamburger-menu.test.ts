/**
 * Contract tests for the inline toolbar (replaced hamburger menu).
 *
 * Validates that:
 *   1. Tool launcher icon buttons exist with correct data-tool attributes
 *   2. Sidebar is hidden/shown via the resize bar (no collapse icon); History selector exists
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

  // On-demand tool launchers must be present as data-tool toolbar icon buttons;
  // openTool() materialises each into a closeable tab on demand. `sql` is one of
  // these. `tables` and `search` are NOT here — they are permanent panel buttons
  // keyed by data-panel-btn (checked separately below).
  const expectedTools = [
    'sql',
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

  // Tables and Search are permanent toolbar buttons (data-panel-btn), not
  // on-demand data-tool launchers, so they are asserted on their own attribute.
  const expectedPanelButtons = ['tables', 'search'];

  for (const panel of expectedPanelButtons) {
    it(`contains data-panel-btn="${panel}" toolbar button`, () => {
      assert.ok(
        html.includes(`data-panel-btn="${panel}"`),
        `Toolbar must contain a data-panel-btn="${panel}" icon button`,
      );
    });
  }

  it('hides/shows the sidebar via the drag bar, not a collapse icon', () => {
    assert.ok(
      !html.includes('id="tb-sidebar-toggle"'),
      'Dedicated collapse icon should be removed in favor of the resize bar',
    );
    assert.ok(html.includes('id="app-sidebar-resizer"'), 'Missing sidebar resize bar');
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

  // Labeled (density) mode must render the activity-bar buttons as an aligned
  // list: equal width (the strip stretches its children), labels left-aligned,
  // and vertical spacing between rows. These three are the user-visible contract
  // for labeled mode — pin them against accidental reversion to the icon-only
  // centered/auto-width/zero-gap layout. Helper slices each rule's body so a
  // generic property like `justify-content: flex-start` (used elsewhere) is
  // matched only inside the intended selector block.
  function ruleBody(selector: string): string {
    const start = css.indexOf(selector + ' {');
    assert.ok(start !== -1, `Compiled CSS must contain "${selector}" rule`);
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    return css.slice(open, close);
  }

  it('labeled mode strip stretches children to equal width with row spacing', () => {
    const strip = ruleBody('#toolbar-bar.tb-labeled');
    assert.ok(
      strip.includes('align-items: stretch'),
      'Labeled strip must stretch children so every button is the same width',
    );
    assert.ok(
      /gap:\s*var\(--space-1\)/.test(strip),
      'Labeled strip must add vertical spacing (gap) between rows',
    );
  });

  it('labeled mode buttons fill width and left-align their labels', () => {
    const btn = ruleBody('#toolbar-bar.tb-labeled .tb-icon-btn');
    assert.ok(
      btn.includes('align-self: stretch'),
      'Labeled button must stretch to the strip width (equal width)',
    );
    assert.ok(
      btn.includes('justify-content: flex-start'),
      'Labeled button must left-align its icon + label',
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
