/**
 * Contract tests for the .drift-table shared class.
 *
 * All data-grid panels (Tables, Search, Query Builder) render tables
 * via buildDataTableHtml() which emits class="drift-table". This test
 * verifies that:
 *  - The HTML builder emits the class on the <table> element
 *  - The Search panel preserves the class when replacing the id
 *  - SCSS styles use .drift-table (not #data-table) for shared rules
 *  - JS event handlers use .drift-table selectors, not id-specific ones
 *  - getVisibleDataColumnKeys() scopes to a .drift-table ancestor
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('.drift-table shared class contract', () => {
  let tableViewTs: string;
  let searchTabTs: string;
  let dataTableScss: string;
  let searchScss: string;
  let appJs: string;
  let cellEditTs: string;

  before(() => {
    tableViewTs = readAsset('assets/web/table-view.ts');
    searchTabTs = readAsset('assets/web/search-tab.ts');
    dataTableScss = readAsset('assets/web/_data-table.scss');
    searchScss = readAsset('assets/web/_search.scss');
    appJs = readAsset('assets/web/app.js');
    cellEditTs = readAsset('assets/web/cell-edit.ts');
  });

  // --- HTML generation ---

  it('buildDataTableHtml emits class="drift-table" on the <table>', () => {
    assert.ok(
      tableViewTs.includes('class="drift-table"'),
      'table-view.ts must add the drift-table class to the generated table',
    );
  });

  it('search-tab replaces only the id, preserving the drift-table class', () => {
    // The search tab does: .replace('id="data-table"', 'id="st-data-table"')
    // This must NOT strip the class attribute.
    assert.ok(
      searchTabTs.includes('id="st-data-table"'),
      'search-tab.ts must set id to st-data-table',
    );
    assert.ok(
      !searchTabTs.includes('class="drift-table"'),
      'search-tab.ts should not re-add the class (it is already on the element)',
    );
    // Ensure the replace targets only the id attribute
    const replaceCall = searchTabTs.match(/\.replace\([^)]+\)/);
    assert.ok(replaceCall, 'search-tab.ts must use .replace() for the id');
    assert.ok(
      replaceCall![0].includes('id="data-table"') && replaceCall![0].includes('id="st-data-table"'),
      'replace must swap id="data-table" for id="st-data-table" only',
    );
  });

  // --- SCSS uses class, not id ---

  it('_data-table.scss uses .drift-table for all table layout rules', () => {
    assert.ok(
      dataTableScss.includes('.drift-table {'),
      'base table rule must use .drift-table class selector',
    );
    assert.ok(
      dataTableScss.includes('.drift-table th,'),
      'th/td rule must use .drift-table class selector',
    );
    assert.ok(
      dataTableScss.includes('.drift-table tbody tr:nth-child(even)'),
      'alternating row rule must use .drift-table class selector',
    );
    assert.ok(
      dataTableScss.includes('.drift-table td:hover .cell-copy-btn'),
      'copy-button hover rule must use .drift-table class selector',
    );
  });

  it('_data-table.scss does not use #data-table for styling (only comments allowed)', () => {
    // Strip comments before checking for id selectors
    const withoutComments = dataTableScss.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(
      !withoutComments.includes('#data-table'),
      '_data-table.scss must not use #data-table as a CSS selector; use .drift-table instead',
    );
  });

  it('_search.scss does not duplicate drift-table styles', () => {
    assert.ok(
      !searchScss.includes('.drift-table'),
      '_search.scss must not duplicate .drift-table rules (they belong in _data-table.scss)',
    );
    assert.ok(
      !searchScss.includes('#st-data-table'),
      '_search.scss must not have #st-data-table styling (shared class handles it)',
    );
  });

  // --- JS event handlers use class selector ---

  it('app.js context menu handler uses .drift-table, not #data-table', () => {
    assert.ok(
      appJs.includes(".drift-table th'") || appJs.includes('.drift-table th'),
      'contextmenu handler must use .drift-table th selector',
    );
    // No id-based selectors for table interaction
    assert.ok(
      !appJs.includes("#data-table th'") && !appJs.includes("#data-table td'"),
      'app.js must not use #data-table for event delegation selectors',
    );
  });

  it('app.js drag-and-drop handlers use .drift-table, not #data-table', () => {
    // All drag event selectors must be class-based
    const dragLines = appJs.split('\n').filter(
      (l: string) => /drag(start|over|leave|end|drop)/.test(l) || l.includes('drag-over'),
    );
    for (const line of dragLines) {
      assert.ok(
        !line.includes('#data-table'),
        `drag handler line must not use #data-table: "${line.trim()}"`,
      );
    }
  });

  it('app.js dblclick handler uses .drift-table td', () => {
    assert.ok(
      appJs.includes(".drift-table td'") || appJs.includes('.drift-table td'),
      'dblclick handler must use .drift-table td selector',
    );
  });

  // --- getVisibleDataColumnKeys scoping ---

  it('getVisibleDataColumnKeys accepts an optional childElement for scoping', () => {
    assert.ok(
      tableViewTs.includes('getVisibleDataColumnKeys(childElement'),
      'function must accept a childElement parameter',
    );
    assert.ok(
      tableViewTs.includes(".closest('.drift-table')"),
      'function must scope to the closest .drift-table ancestor',
    );
  });

  it('cell-edit.ts passes td to getVisibleDataColumnKeys for scoping', () => {
    assert.ok(
      cellEditTs.includes('getVisibleDataColumnKeys(td)'),
      'cell-edit.ts must pass td element to scope the column key query',
    );
  });
});
