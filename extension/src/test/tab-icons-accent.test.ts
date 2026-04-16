/**
 * Contract tests for tab icons and per-tab-type accent colors.
 *
 * Validates that:
 *   1. state.ts exports a TOOL_ICONS map covering every TOOL_LABELS key
 *   2. tabs.ts createClosableTab sets data-tab-type and prepends an icon span
 *   3. html_content.dart static tabs have data-tab-type and tab-icon spans
 *   4. _tab-bar.scss defines .tab-icon styles and uses --tab-accent fallback
 *   5. Midnight and Showcase themes define --tab-accent for each tab type
 *   6. style.css (compiled) contains the --tab-accent rules
 *
 * Before: all tabs shared a single --link color; no icons on tabs.
 * After: each tab type has a unique icon and, on midnight/showcase, a unique accent color.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Tab icons — state.ts', () => {
  let stateSrc: string;

  before(() => {
    stateSrc = readAsset('assets/web/state.ts');
  });

  it('exports TOOL_ICONS map', () => {
    assert.ok(
      stateSrc.includes('export const TOOL_ICONS'),
      'state.ts must export TOOL_ICONS',
    );
  });

  it('TOOL_ICONS covers every key in TOOL_LABELS', () => {
    // Extract keys from TOOL_LABELS
    const labelsMatch = stateSrc.match(
      /TOOL_LABELS\s*:\s*Record<[^>]+>\s*=\s*\{([^}]+)\}/,
    );
    assert.ok(labelsMatch, 'Could not find TOOL_LABELS definition');
    const labelKeys = (labelsMatch as RegExpMatchArray)[1]
      .split('\n')
      .map((l) => l.match(/^\s*(\w+)\s*:/))
      .filter(Boolean)
      .map((m) => (m as RegExpMatchArray)[1]);

    // Extract keys from TOOL_ICONS
    const iconsMatch = stateSrc.match(
      /TOOL_ICONS\s*:\s*Record<[^>]+>\s*=\s*\{([^}]+)\}/,
    );
    assert.ok(iconsMatch, 'Could not find TOOL_ICONS definition');
    const iconKeys = (iconsMatch as RegExpMatchArray)[1]
      .split('\n')
      .map((l) => l.match(/^\s*(\w+)\s*:/))
      .filter(Boolean)
      .map((m) => (m as RegExpMatchArray)[1]);

    for (const key of labelKeys) {
      assert.ok(
        iconKeys.includes(key),
        `TOOL_ICONS is missing key '${key}' that exists in TOOL_LABELS`,
      );
    }
  });
});

describe('Tab icons — tabs.ts createClosableTab', () => {
  let tabsSrc: string;
  let fnBody: string;

  before(() => {
    tabsSrc = readAsset('assets/web/tabs.ts');
    // Extract the createClosableTab function body
    const fnStart = tabsSrc.indexOf('export function createClosableTab');
    const fnEnd = tabsSrc.indexOf('export function', fnStart + 1);
    fnBody = tabsSrc.slice(fnStart, fnEnd);
  });

  it('sets data-tab-type attribute on new tabs', () => {
    assert.ok(
      fnBody.includes("setAttribute('data-tab-type'"),
      'createClosableTab must set data-tab-type attribute for CSS accent targeting',
    );
  });

  it('resolves tbl:* tabs to the "tables" type', () => {
    // The tab type resolution must map 'tbl:*' IDs to the 'tables' type
    assert.ok(
      fnBody.includes("'tbl:'") && fnBody.includes("'tables'"),
      'createClosableTab must resolve tbl:* tab IDs to the tables tab type',
    );
  });

  it('prepends a Material Symbols icon span', () => {
    assert.ok(
      fnBody.includes('tab-icon') && fnBody.includes('TOOL_ICONS'),
      'createClosableTab must prepend an icon span using TOOL_ICONS',
    );
  });

  it('uses appendChild (not textContent) for non-truncated labels', () => {
    // textContent would overwrite the icon span; must use createTextNode
    assert.ok(
      fnBody.includes('createTextNode(label)'),
      'createClosableTab must use createTextNode for labels to preserve the icon span',
    );
  });
});

describe('Tab icons — html_content.dart static tabs', () => {
  let htmlSrc: string;

  before(() => {
    htmlSrc = readAsset('lib/src/server/html_content.dart');
  });

  it('static Tables tab has data-tab-type and icon', () => {
    assert.ok(
      htmlSrc.includes('data-tab-type="tables"'),
      'Static Tables tab must have data-tab-type="tables"',
    );
    assert.ok(
      htmlSrc.includes('tab-icon" aria-hidden="true">table_chart'),
      'Static Tables tab must have a table_chart icon',
    );
  });

  it('static Search tab has data-tab-type and icon', () => {
    assert.ok(
      htmlSrc.includes('data-tab-type="search"'),
      'Static Search tab must have data-tab-type="search"',
    );
    assert.ok(
      htmlSrc.includes('tab-icon" aria-hidden="true">search'),
      'Static Search tab must have a search icon',
    );
  });

  it('static Run SQL tab has data-tab-type and icon', () => {
    assert.ok(
      htmlSrc.includes('data-tab-type="sql"'),
      'Static Run SQL tab must have data-tab-type="sql"',
    );
    assert.ok(
      htmlSrc.includes('tab-icon" aria-hidden="true">terminal'),
      'Static Run SQL tab must have a terminal icon',
    );
  });
});

describe('Tab accent colors — _tab-bar.scss', () => {
  let tabBarScss: string;

  before(() => {
    tabBarScss = readAsset('assets/web/_tab-bar.scss');
  });

  it('defines .tab-icon styles', () => {
    assert.ok(
      tabBarScss.includes('.tab-bar .tab-icon'),
      '_tab-bar.scss must define .tab-icon styles',
    );
  });

  it('active tab uses --tab-accent with --link fallback', () => {
    assert.ok(
      tabBarScss.includes('var(--tab-accent, var(--link))'),
      'Active tab must use var(--tab-accent, var(--link)) for color and border-top',
    );
  });
});

describe('Tab accent colors — theme SCSS', () => {
  let midnightScss: string;
  let showcaseScss: string;

  /** The tab types that should have accent colors in themed themes. */
  const tabTypes = [
    'tables', 'search', 'sql', 'snapshot', 'compare',
    'index', 'size', 'perf', 'anomaly', 'import',
    'schema', 'diagram', 'export', 'settings',
  ];

  before(() => {
    midnightScss = readAsset('assets/web/_theme-midnight.scss');
    showcaseScss = readAsset('assets/web/_theme-showcase.scss');
  });

  for (const tabType of tabTypes) {
    it(`midnight theme defines --tab-accent for "${tabType}"`, () => {
      const selector = `[data-tab-type="${tabType}"]`;
      assert.ok(
        midnightScss.includes(selector) && midnightScss.includes('--tab-accent'),
        `_theme-midnight.scss must set --tab-accent for data-tab-type="${tabType}"`,
      );
    });

    it(`showcase theme defines --tab-accent for "${tabType}"`, () => {
      const selector = `[data-tab-type="${tabType}"]`;
      assert.ok(
        showcaseScss.includes(selector) && showcaseScss.includes('--tab-accent'),
        `_theme-showcase.scss must set --tab-accent for data-tab-type="${tabType}"`,
      );
    });
  }

  it('midnight active tab uses --tab-accent fallback', () => {
    assert.ok(
      midnightScss.includes('var(--tab-accent, var(--link))'),
      'Midnight active tab must use var(--tab-accent, var(--link))',
    );
  });

  it('showcase active tab uses --tab-accent fallback', () => {
    assert.ok(
      showcaseScss.includes('var(--tab-accent, var(--link))'),
      'Showcase active tab must use var(--tab-accent, var(--link))',
    );
  });
});

describe('Tab accent colors — compiled style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('compiled CSS contains --tab-accent rules', () => {
    assert.ok(
      css.includes('--tab-accent'),
      'style.css must contain --tab-accent custom property declarations',
    );
  });

  it('compiled CSS contains .tab-icon styles', () => {
    assert.ok(
      css.includes('.tab-icon'),
      'style.css must contain .tab-icon class styles',
    );
  });

  it('compiled CSS uses --tab-accent fallback in active tab', () => {
    assert.ok(
      css.includes('var(--tab-accent, var(--link))'),
      'Compiled active tab must use var(--tab-accent, var(--link))',
    );
  });
});
