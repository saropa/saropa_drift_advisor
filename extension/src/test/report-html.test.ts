import * as assert from 'assert';
import { buildReportHtml } from '../report/report-html';
import type { IReportData } from '../report/report-types';

/** Max chars to slice for "schema section only" assertions (avoids matching data tab). */
const SCHEMA_SECTION_SLICE_LENGTH = 1500;

function sampleData(overrides: Partial<IReportData> = {}): IReportData {
  return {
    generatedAt: '2026-03-14T10:00:00.000Z',
    serverUrl: 'http://127.0.0.1:8642',
    tables: [{
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT', pk: false },
      ],
      rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      totalRowCount: 2,
      truncated: false,
    }],
    ...overrides,
  };
}

describe('buildReportHtml', () => {
  it('should produce valid HTML with DOCTYPE', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('should contain the generation timestamp', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes('2026-03-14T10:00:00.000Z'));
  });

  it('should contain the server URL', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes('http://127.0.0.1:8642'));
  });

  it('should list tables in the sidebar', () => {
    const data = sampleData({
      tables: [
        {
          name: 'users', columns: [], rows: [],
          totalRowCount: 100, truncated: false,
        },
        {
          name: 'orders', columns: [], rows: [],
          totalRowCount: 50, truncated: false,
        },
      ],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('data-table="users"'));
    assert.ok(html.includes('data-table="orders"'));
  });

  it('should embed table data as JSON in a script tag', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes('var DATA = ['));
    assert.ok(html.includes('"name":"users"'));
  });

  it('should HTML-escape values to prevent XSS in table names', () => {
    const data = sampleData({
      tables: [{
        name: '<script>alert("xss")</script>',
        columns: [{ name: 'val', type: 'TEXT', pk: false }],
        rows: [{ val: 'safe' }],
        totalRowCount: 1,
        truncated: false,
      }],
    });
    const html = buildReportHtml(data);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('should show truncated indicator when rows exceed max', () => {
    const data = sampleData({
      tables: [{
        name: 'big',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rows: [{ id: 1 }],
        totalRowCount: 10000,
        truncated: true,
      }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('(truncated)'));
  });

  it('should not show truncated indicator when not truncated', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(!html.includes('(truncated)'));
  });

  it('should render empty tables correctly', () => {
    const data = sampleData({
      tables: [{
        name: 'empty',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rows: [],
        totalRowCount: 0,
        truncated: false,
      }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('data-table="empty"'));
    assert.ok(html.includes('>0</span>'));
  });

  it('should include schema section when schema is provided', () => {
    const data = sampleData({
      schema: [{
        table: 'users',
        sql: 'CREATE TABLE "users" (id INTEGER PRIMARY KEY, name TEXT)',
      }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('id="section-schema"'));
    const schemaStart = html.indexOf('id="section-schema"');
    const schemaSlice = html.slice(schemaStart, schemaStart + SCHEMA_SECTION_SLICE_LENGTH);
    assert.ok(schemaSlice.includes('users'), 'schema section should contain table name');
    // highlightSql wraps keywords in <span>s, so "CREATE TABLE" is not a literal substring
    assert.ok(schemaSlice.includes('CREATE') && schemaSlice.includes('TABLE'), 'schema SQL (CREATE TABLE) should be present in section');
  });

  it('should render schema section with defensive fallbacks for missing table or empty sql', () => {
    const data = sampleData({
      schema: [
        { table: '', sql: 'CREATE TABLE "x" (id INT);' },
        { table: 't2', sql: '' },
      ],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('id="section-schema"'));
    assert.ok(html.includes('(unnamed)'), 'empty table name should show (unnamed)');
    assert.ok(html.includes('CREATE') && html.includes('TABLE'), 'SQL should be present');
    assert.ok(html.includes('t2'), 'second table name should be present');
  });

  it('should omit schema section when schema is undefined', () => {
    const data = sampleData({ schema: undefined });
    const html = buildReportHtml(data);
    assert.ok(!html.includes('id="section-schema"'));
  });

  it('should include anomaly section when anomalies are provided', () => {
    const data = sampleData({
      anomalies: [{ message: 'Orphaned FK', severity: 'warning' }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('id="section-anomalies"'));
    assert.ok(html.includes('Orphaned FK'));
  });

  it('should show empty message when anomaly array is empty', () => {
    const data = sampleData({ anomalies: [] });
    const html = buildReportHtml(data);
    assert.ok(html.includes('No anomalies detected.'));
  });

  it('should omit anomaly section when anomalies is undefined', () => {
    const data = sampleData({ anomalies: undefined });
    const html = buildReportHtml(data);
    assert.ok(!html.includes('id="section-anomalies"'));
  });

  it('should include theme toggle button', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes('toggleTheme()'));
    assert.ok(html.includes('Toggle Theme'));
  });

  it('should include navigation tabs when schema present', () => {
    const data = sampleData({
      schema: [{ table: 'users', sql: 'CREATE TABLE "users"(id INT)' }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('class="nav-tabs"'));
    assert.ok(html.includes('data-section="schema"'));
  });

  it('should include navigation tabs when anomalies present', () => {
    const data = sampleData({ anomalies: [] });
    const html = buildReportHtml(data);
    assert.ok(html.includes('class="nav-tabs"'));
    assert.ok(html.includes('data-section="anomalies"'));
  });

  it('should not include navigation tabs when only data present', () => {
    const data = sampleData({ schema: undefined, anomalies: undefined });
    const html = buildReportHtml(data);
    assert.ok(!html.includes('class="nav-tabs"'));
  });

  it('should include light/dark CSS custom properties', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes(':root'));
    assert.ok(html.includes('[data-theme="dark"]'));
  });

  it('should include pagination logic in script', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(html.includes('PAGE_SIZE'));
    assert.ok(html.includes('goPage'));
    assert.ok(html.includes('renderPagination'));
  });

  it('should include footer with generation timestamp', () => {
    const html = buildReportHtml(sampleData());
    assert.ok(
      html.includes('Generated by Saropa Drift Advisor at 2026-03-14T10:00:00.000Z'),
    );
  });

  it('should escape table names with quotes in onclick', () => {
    const data = sampleData({
      tables: [{
        name: "it's",
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rows: [],
        totalRowCount: 0,
        truncated: false,
      }],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes("showTable('it\\'s')"));
  });

  it('should render anomaly severity icons', () => {
    const data = sampleData({
      anomalies: [
        { message: 'Error msg', severity: 'error' },
        { message: 'Warning msg', severity: 'warning' },
        { message: 'Info msg', severity: 'info' },
      ],
    });
    const html = buildReportHtml(data);
    assert.ok(html.includes('anomaly-error'));
    assert.ok(html.includes('anomaly-warning'));
    assert.ok(html.includes('anomaly-info'));
  });
});
