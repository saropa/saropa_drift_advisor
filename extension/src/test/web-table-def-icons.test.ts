/**
 * Contract tests for the table-definition type icons and PK/FK badges.
 *
 * Verifies that app.js:
 *  - contains the columnTypeIcon helper with type-to-glyph mappings
 *  - emits a fixed-width .table-def-icons column in the table header
 *  - emits .table-def-icon, .table-def-badge-pk, .table-def-badge-fk classes
 *  - buildTableDefinitionHtml references fkMetaCache for FK detection
 *
 * Verifies that style.scss/style.css:
 *  - defines fixed-width styles for .table-def-icons
 *  - defines styles for .table-def-icon, .table-def-badge, .table-def-badge-pk, .table-def-badge-fk
 */
import * as assert from 'assert';
import { readAsset, extractBlock } from './web-theme-test-helpers';

describe('table-def icons — table-view.ts columnTypeIcon function', () => {
  let appJs: string;

  before(() => {
    // columnTypeIcon and table-definition HTML moved to table-view.ts
    appJs = readAsset('assets/web/table-view.ts');
  });

  it('defines columnTypeIcon function', () => {
    assert.ok(
      appJs.includes('function columnTypeIcon('),
      'app.js should define the columnTypeIcon helper',
    );
  });

  it('maps INT types to # glyph', () => {
    // The regex /INT/ should match INTEGER, INT, BIGINT, etc.
    assert.ok(
      appJs.includes('/INT/.test(t)'),
      'columnTypeIcon should test for INT types',
    );
  });

  it('maps TEXT/CHAR types to T glyph', () => {
    assert.ok(
      appJs.includes('CHAR|TEXT|CLOB|STRING'),
      'columnTypeIcon should test for text types',
    );
  });

  it('maps REAL/FLOAT types to .# glyph', () => {
    assert.ok(
      appJs.includes('REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL'),
      'columnTypeIcon should test for floating-point types',
    );
  });

  it('maps BLOB/BINARY types', () => {
    assert.ok(
      appJs.includes('BLOB|BINARY'),
      'columnTypeIcon should test for blob types',
    );
  });

  it('maps BOOL types', () => {
    assert.ok(
      appJs.includes('/BOOL/.test(t)'),
      'columnTypeIcon should test for boolean types',
    );
  });

  it('maps DATE/TIME types', () => {
    assert.ok(
      appJs.includes('DATE|TIME|TIMESTAMP'),
      'columnTypeIcon should test for date/time types',
    );
  });

  it('has a fallback for unknown types', () => {
    // The fallback should return ○ (\u25CB)
    const fallbackCount = (appJs.match(/\\u25CB/g) || []).length;
    assert.ok(
      fallbackCount >= 2,
      'should have at least two \\u25CB references (null check + fallback)',
    );
  });
});

describe('table-def icons — table-view.ts HTML output', () => {
  let appJs: string;

  before(() => {
    // buildTableDefinitionHtml and related HTML output moved to table-view.ts
    appJs = readAsset('assets/web/table-view.ts');
  });

  it('emits .table-def-icons in header row', () => {
    assert.ok(
      appJs.includes('th class="table-def-icons"'),
      'table header should include a .table-def-icons column',
    );
  });

  it('emits .table-def-icons in body rows', () => {
    assert.ok(
      appJs.includes('td class="table-def-icons"'),
      'table body rows should include a .table-def-icons cell',
    );
  });

  it('emits .table-def-icon span for type glyph', () => {
    assert.ok(
      appJs.includes('class="table-def-icon"'),
      'should wrap type icon in a .table-def-icon span',
    );
  });

  it('emits .table-def-badge-pk for primary key columns', () => {
    assert.ok(
      appJs.includes('table-def-badge-pk'),
      'should emit PK badge class',
    );
    assert.ok(
      appJs.includes('Primary key'),
      'PK badge should have a descriptive title attribute',
    );
  });

  it('emits .table-def-badge-fk for foreign key columns', () => {
    assert.ok(
      appJs.includes('table-def-badge-fk'),
      'should emit FK badge class',
    );
  });

  it('reads FK metadata from fkMetaCache', () => {
    assert.ok(
      appJs.includes('fkMetaCache[tableName]'),
      'buildTableDefinitionHtml should read FK metadata from cache',
    );
  });
});

describe('table-def icons — style.scss CSS rules', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('defines .table-def-icons with fixed width', () => {
    const block = extractBlock(css, '.table-def-icons');
    assert.ok(block.length > 0, '.table-def-icons rule should exist');
    assert.ok(block.includes('min-width'), 'should set min-width for fixed width');
    assert.ok(block.includes('max-width'), 'should set max-width for fixed width');
    assert.ok(block.includes('white-space: nowrap'), 'should prevent wrapping');
  });

  it('defines .table-def-icon for the type glyph', () => {
    const block = extractBlock(css, '.table-def-icon');
    assert.ok(block.length > 0, '.table-def-icon rule should exist');
    assert.ok(block.includes('text-align: center'), 'icon should be centered');
  });

  it('defines .table-def-badge base style', () => {
    const block = extractBlock(css, '.table-def-badge');
    assert.ok(block.length > 0, '.table-def-badge rule should exist');
    assert.ok(block.includes('font-size'), 'badge should have explicit font-size');
  });

  it('defines .table-def-badge-pk style', () => {
    assert.ok(
      css.includes('.table-def-badge-pk'),
      '.table-def-badge-pk rule should exist',
    );
  });

  it('defines .table-def-badge-fk style', () => {
    assert.ok(
      css.includes('.table-def-badge-fk'),
      '.table-def-badge-fk rule should exist',
    );
  });
});
