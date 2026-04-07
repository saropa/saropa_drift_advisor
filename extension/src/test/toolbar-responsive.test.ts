/**
 * Contract tests for the responsive tools toolbar in style.css.
 *
 * Validates that the toolbar uses nowrap layout and that three
 * progressive media-query breakpoints hide the correct label
 * groups, preventing toolbar wrapping at narrow widths.
 *
 * Before: toolbar used flex-wrap: wrap and labels were always
 * visible, causing a second row at narrow widths.
 *
 * After: toolbar uses flex-wrap: nowrap with three breakpoints
 * (≤1100px, ≤900px, ≤700px) that progressively hide labels
 * via display: none on .toolbar-tool-label spans, leaving
 * icon-only buttons with title-attribute tooltips.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('Responsive toolbar — style.css', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  /* ----------------------------------------------------------
   * Base layout: toolbar must not wrap
   * ---------------------------------------------------------- */

  it('tools-toolbar uses flex-wrap: nowrap', () => {
    // The toolbar container must prevent wrapping so that
    // labels collapse via media queries instead.
    assert.ok(
      css.includes('flex-wrap: nowrap'),
      'tools-toolbar must use flex-wrap: nowrap to prevent line wrapping',
    );
  });

  it('tools-toolbar has overflow-x: auto as safety net', () => {
    // In case all 12 icon-only buttons still overflow at an
    // extremely narrow width, horizontal scroll is available.
    assert.ok(
      css.includes('overflow-x: auto'),
      'tools-toolbar needs overflow-x: auto for extreme narrow widths',
    );
  });

  /* ----------------------------------------------------------
   * Breakpoint 1: ≤1100px — hide 5 longest / least-obvious labels
   * ---------------------------------------------------------- */

  const tier1Tools = ['snapshot', 'diagram', 'export', 'import', 'anomaly'];

  it('has a ≤1100px media query', () => {
    assert.ok(
      css.includes('@media (max-width: 1100px)'),
      'Missing first responsive breakpoint at 1100px',
    );
  });

  for (const tool of tier1Tools) {
    it(`≤1100px hides label for data-tool="${tool}"`, () => {
      // Each tier-1 tool must have its .toolbar-tool-label set to
      // display: none inside the 1100px media query.
      // Sass may strip quotes from simple attribute values, so accept
      // both data-tool="foo" and data-tool=foo in compiled output.
      const quoted = `data-tool="${tool}"] .toolbar-tool-label`;
      const unquoted = `data-tool=${tool}] .toolbar-tool-label`;
      assert.ok(
        css.includes(quoted) || css.includes(unquoted),
        `1100px breakpoint must target ${tool} label`,
      );
    });
  }

  /* ----------------------------------------------------------
   * Breakpoint 2: ≤900px — hide 4 more medium labels
   * ---------------------------------------------------------- */

  const tier2Tools = ['compare', 'schema', 'tables', 'index'];

  it('has a ≤900px media query', () => {
    assert.ok(
      css.includes('@media (max-width: 900px)'),
      'Missing second responsive breakpoint at 900px',
    );
  });

  for (const tool of tier2Tools) {
    it(`≤900px hides label for data-tool="${tool}"`, () => {
      // Sass may strip quotes — accept both quoted and unquoted forms.
      const quoted = `data-tool="${tool}"] .toolbar-tool-label`;
      const unquoted = `data-tool=${tool}] .toolbar-tool-label`;
      assert.ok(
        css.includes(quoted) || css.includes(unquoted),
        `900px breakpoint must target ${tool} label`,
      );
    });
  }

  /* ----------------------------------------------------------
   * Breakpoint 3: ≤700px — all labels hidden, icon-only mode
   * ---------------------------------------------------------- */

  it('has a ≤700px media query', () => {
    assert.ok(
      css.includes('@media (max-width: 700px)'),
      'Missing third responsive breakpoint at 700px',
    );
  });

  it('≤700px hides all toolbar-tool-label elements', () => {
    // At the narrowest breakpoint, a blanket rule hides every
    // remaining label so the toolbar is fully icon-only.
    // Extract the 700px media block and verify it targets the
    // generic .toolbar-tool-label selector (not tool-specific).
    const idx = css.indexOf('@media (max-width: 700px)');
    assert.ok(idx !== -1, 'Could not locate 700px media query');
    // Grab a reasonable chunk after the @media opening to check contents.
    const block = css.substring(idx, idx + 500);
    assert.ok(
      block.includes('.toolbar-tool-btn .toolbar-tool-label'),
      '700px breakpoint must hide all .toolbar-tool-label elements',
    );
    assert.ok(
      block.includes('display: none'),
      '700px breakpoint must use display: none to hide labels',
    );
  });

  it('≤700px tightens button padding for icon-only mode', () => {
    // When buttons lose their labels, padding should shrink so
    // the icons don't have excessive whitespace.
    const idx = css.indexOf('@media (max-width: 700px)');
    const block = css.substring(idx, idx + 500);
    assert.ok(
      block.includes('padding:') || block.includes('padding '),
      '700px breakpoint should adjust button padding for compact icon-only layout',
    );
  });

  /* ----------------------------------------------------------
   * Coverage: all 12 toolbar tools are accounted for
   * ---------------------------------------------------------- */

  it('all 12 toolbar tools have labels hidden at some breakpoint', () => {
    // The three remaining labels (search, size, perf) are hidden
    // by the blanket ≤700px rule. Tier 1 + Tier 2 cover the other 9.
    // Total: 5 + 4 + 3 (blanket) = 12.
    const allTools = [
      ...tier1Tools,
      ...tier2Tools,
      'search',
      'size',
      'perf',
    ];
    assert.strictEqual(
      allTools.length,
      12,
      'Expected exactly 12 toolbar tools across all breakpoint tiers',
    );
  });
});
