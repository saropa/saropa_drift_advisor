/**
 * Contract tests for the table-definition meta columns + export tools.
 *
 * Verifies that table-def-meta.ts:
 *  - exists and exports initTableDefMeta
 *  - uses document-level event delegation on .table-def-tool buttons
 *  - calls stopPropagation so a tool click does not collapse the panel
 *  - builds the profiling stats query against /api/sql
 *  - builds a Drift Table class (Flutter export) and JSON export
 *
 * Verifies that table-view.ts (buildTableDefinitionHtml):
 *  - emits the three tool buttons with their data-tdm-action values
 *  - emits data-table-name on the wrap (resolves the target table on click)
 *  - renders profiling meta cells (fill bar, uniqueness key flag) when on
 *
 * Verifies that style.scss/style.css define the tool + meta column styles.
 */
import * as assert from 'assert';
import { readAsset } from './web-theme-test-helpers';

describe('table-def-meta.ts — meta columns + export tools module', () => {
  let js: string;

  before(() => {
    js = readAsset('assets/web/table-def-meta.ts');
  });

  it('file exists and exports initTableDefMeta', () => {
    assert.ok(js.length > 0, 'table-def-meta.ts should not be empty');
    assert.ok(js.includes('export function initTableDefMeta'), 'should export initTableDefMeta');
  });

  it('uses document-level event delegation on .table-def-tool', () => {
    assert.ok(js.includes("document.addEventListener('click'"), 'should delegate clicks on document');
    assert.ok(js.includes('.table-def-tool'), 'should target .table-def-tool buttons');
  });

  it('stops propagation so a tool click does not collapse the panel', () => {
    assert.ok(js.includes('stopPropagation'), 'tool click must not bubble to the heading collapse handler');
  });

  it('builds the profiling stats query against /api/sql', () => {
    assert.ok(js.includes("'/api/sql'"), 'should POST the stats query to /api/sql');
    assert.ok(js.includes('COUNT(DISTINCT'), 'stats query should count distinct values');
    assert.ok(js.includes('SUM(LENGTH('), 'stats query should sum byte length for size');
  });

  it('builds Flutter (Drift) and JSON exports', () => {
    assert.ok(js.includes('extends Table'), 'Flutter export should emit a Drift Table class');
    assert.ok(js.includes('autoIncrement'), 'single integer PK should use autoIncrement');
    assert.ok(js.includes('JSON.stringify'), 'JSON export should serialize the definition');
  });
});

describe('table-def-meta — table-view.ts DOM contract', () => {
  let tableViewTs: string;

  before(() => {
    tableViewTs = readAsset('assets/web/table-view.ts');
  });

  it('emits the three tool buttons with data-tdm-action values', () => {
    assert.ok(tableViewTs.includes('data-tdm-action="toggle-meta"'), 'meta toggle button');
    assert.ok(tableViewTs.includes('data-tdm-action="copy-json"'), 'copy JSON button');
    assert.ok(tableViewTs.includes('data-tdm-action="copy-flutter"'), 'copy Flutter button');
  });

  it('emits data-table-name on the wrap so clicks resolve the target table', () => {
    assert.ok(tableViewTs.includes('data-table-name="'), 'wrap should carry data-table-name');
  });

  it('renders profiling meta cells (fill bar + key flag) when meta is on', () => {
    assert.ok(tableViewTs.includes('tdm-bar-fill'), 'should render the fill completeness bar');
    assert.ok(tableViewTs.includes('buildColumnMetaCells'), 'should build per-column meta cells');
    assert.ok(tableViewTs.includes('S.tableDefMetaOn'), 'should gate meta rendering on the state flag');
  });
});

describe('table-def-meta — style contract', () => {
  let css: string;

  before(() => {
    css = readAsset('assets/web/style.css');
  });

  it('defines the tool button and meta column styles', () => {
    assert.ok(css.includes('.table-def-tool'), 'should style the heading tool buttons');
    assert.ok(css.includes('.table-def-tools'), 'should style the tools group');
    assert.ok(css.includes('.tdm-bar-fill'), 'should style the fill bar');
  });
});
