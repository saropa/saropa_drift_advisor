/**
 * Contract tests for four web-viewer table-view changes:
 *
 *  1. BLOB cells render a bounded preview (BLOB_PREVIEW_CHARS) instead of the
 *     full value, with a hover expand button — avoids the full-line layout
 *     cost that froze the grid on binary-heavy tables.
 *  2. The table-definition panel emits a per-column "Show" checkbox
 *     (.table-def-colvis) that toggles result-grid visibility.
 *  3. The results heading uses buildResultsLabel, which collapses the
 *     redundant "N of N" to a single count and only prints totals when they
 *     differ ("rows / columns").
 *  4. Collapsible chevrons are right-aligned (margin-left:auto) and dimmed
 *     (var(--muted)) CSS ::after, not link-colored arrow glyphs in the text.
 *
 * These pin source-level intent in table-view.ts and the compiled style.css so
 * a future refactor cannot silently revert the behavior.
 */
import * as assert from 'assert';
import { readAsset, extractBlock } from './web-theme-test-helpers';

describe('table-view BLOB previews', () => {
  let tableView: string;
  let css: string;

  before(() => {
    tableView = readAsset('assets/web/table-view.ts');
    css = readAsset('assets/web/style.css');
  });

  it('caps the BLOB preview to a bounded character count', () => {
    assert.ok(
      tableView.includes('BLOB_PREVIEW_CHARS'),
      'should define a BLOB preview character cap',
    );
    assert.ok(
      /isBlobType\s*\(/.test(tableView),
      'should detect BLOB/binary columns via isBlobType',
    );
    assert.ok(
      tableView.includes('.substring(0, BLOB_PREVIEW_CHARS)'),
      'should hard-substring the value, not rely on CSS ellipsis',
    );
  });

  it('emits a hover expand button only for truncated BLOB cells', () => {
    assert.ok(
      tableView.includes('cell-expand-btn'),
      'should render the expand button class',
    );
    assert.ok(
      tableView.includes('blobTruncated'),
      'expand button must be gated on the value actually being clipped',
    );
  });

  it('styles the expand button to the left of copy (right: 30px)', () => {
    const block = extractBlock(css, '.drift-table td .cell-expand-btn');
    assert.ok(block.length > 0, '.cell-expand-btn rule should exist');
    assert.ok(block.includes('right: 30px'), 'expand button sits beside copy');
  });
});

describe('table-definition show/hide checkbox', () => {
  let tableView: string;

  before(() => {
    tableView = readAsset('assets/web/table-view.ts');
  });

  it('emits a .table-def-colvis checkbox per column', () => {
    assert.ok(
      tableView.includes('table-def-colvis'),
      'each column row should carry a visibility checkbox',
    );
    assert.ok(
      tableView.includes('data-col-key="'),
      'checkbox should identify its column via data-col-key',
    );
  });

  it('drives the checkbox from columnConfig.hidden (single source)', () => {
    assert.ok(
      /hiddenCols\s*=\s*\(cfg && cfg\.hidden\)/.test(tableView),
      'checked state should derive from columnConfig.hidden, not a parallel flag',
    );
  });

  it('emits a Show header column in the definition table', () => {
    assert.ok(
      tableView.includes('<th class="table-def-vis"'),
      'definition table header should include the Show column',
    );
  });
});

describe('results heading label', () => {
  let tableView: string;

  before(() => {
    tableView = readAsset('assets/web/table-view.ts');
  });

  it('defines buildResultsLabel', () => {
    assert.ok(
      tableView.includes('function buildResultsLabel('),
      'shared results-label helper should exist',
    );
  });

  it('collapses redundant totals and prints rows + columns', () => {
    // The helper only appends " of <total>" when the total differs from the
    // page count; otherwise it prints a single "<n> rows".
    assert.ok(
      tableView.includes("totalRows !== rowCount"),
      'rows should collapse to one count when total equals the page count',
    );
    assert.ok(
      tableView.includes("visibleCols !== totalCols"),
      'columns should collapse to one count when all columns are visible',
    );
    assert.ok(
      tableView.includes("' / '"),
      'label should join rows and columns with a slash separator',
    );
  });

  it('no longer prefixes the heading with an arrow glyph', () => {
    // The heading text must start at "Results" with no leading ▲/▼ — the
    // chevron is a CSS ::after now, not a character in the markup.
    assert.ok(
      /results-table-heading">Results /.test(tableView),
      'heading text should start at "Results", chevron is CSS',
    );
    assert.ok(
      !/▲ Results|▼ Results/.test(tableView),
      'no arrow glyph should precede the Results label',
    );
  });
});

describe('collapsible chevrons — right-aligned and dimmed', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  // Each collapsible heading must place its chevron via ::after on the right
  // (margin-left:auto) in muted color — never the old left-of-text link arrow.
  const headings = [
    '.results-table-heading::after',
    '.table-definition-heading::after',
    '.qb-section .qb-header::after',
  ];

  for (const sel of headings) {
    it(`${sel} is right-aligned and muted`, () => {
      const block = extractBlock(css, sel);
      assert.ok(block.length > 0, `${sel} rule should exist`);
      assert.ok(block.includes('margin-left: auto'), `${sel} should push the chevron right`);
      assert.ok(block.includes('var(--muted)'), `${sel} chevron should be dimmed, not link color`);
    });
  }

  it('non-collapsible multi-table QB labels have no chevron', () => {
    const block = extractBlock(css, '.qb-section .qb-header.qb-header-static::after');
    assert.ok(block.length > 0, 'static-header ::after rule should exist');
    assert.ok(block.includes('content: none'), 'static section labels suppress the chevron');
  });
});
