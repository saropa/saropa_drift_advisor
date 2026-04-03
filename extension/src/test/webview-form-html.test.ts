/**
 * Tests for the HTML builder functions of the new webview form panels.
 * Verifies that each form renders the expected inputs, options, and structure.
 * This covers the "before vs after" behavior: old showQuickPick/showInputBox
 * prompts are now rendered as HTML form elements in a webview.
 */

import * as assert from 'assert';
import { buildIndexSuggestionsHtml } from '../health/index-suggestions-html';
import { buildAnomaliesHtml } from '../health/anomalies-html';
import { buildPerfBaselineHtml } from '../debug/perf-baseline-html';
import { buildAnnotateFormHtml } from '../annotations/annotate-form-html';
import { buildCompareFormHtml } from '../comparator/compare-form-html';
import { buildBreakpointFormHtml } from '../data-breakpoint/breakpoint-form-html';
import { buildChangelogFormHtml } from '../changelog/changelog-form-html';
import { buildImportFormHtml } from '../data-management/import-form-html';
import { buildExportFormHtml } from '../data-management/export-form-html';

describe('Webview HTML builders', () => {
  describe('buildIndexSuggestionsHtml', () => {
    it('should render empty state for zero suggestions', () => {
      const html = buildIndexSuggestionsHtml([]);
      assert.ok(html.includes('No missing indexes detected'));
      // Should NOT contain a table element
      assert.ok(!html.includes('<thead>'));
    });

    it('should render table rows with SQL and priority badges', () => {
      const html = buildIndexSuggestionsHtml([
        { table: 't1', column: 'c1', reason: 'FK', sql: 'CREATE INDEX idx ON t1(c1)', priority: 'high' },
      ]);
      assert.ok(html.includes('t1'));
      assert.ok(html.includes('c1'));
      assert.ok(html.includes('priority-high'));
      assert.ok(html.includes('CREATE INDEX idx ON t1(c1)'));
      assert.ok(html.includes('Copy Selected SQL'));
      assert.ok(html.includes('Create All Indexes'));
    });

    it('should HTML-escape table/column names', () => {
      const html = buildIndexSuggestionsHtml([
        { table: '<script>', column: '&col', reason: 'r', sql: 's', priority: 'low' },
      ]);
      assert.ok(html.includes('&lt;script&gt;'));
      assert.ok(html.includes('&amp;col'));
    });
  });

  describe('buildAnomaliesHtml', () => {
    it('should render empty state for zero anomalies', () => {
      const html = buildAnomaliesHtml([]);
      assert.ok(html.includes('No anomalies found'));
    });

    it('should render filter buttons with severity counts', () => {
      const html = buildAnomaliesHtml([
        { message: 'err1', severity: 'error' },
        { message: 'err2', severity: 'error' },
        { message: 'warn1', severity: 'warning' },
      ]);
      assert.ok(html.includes('(3)'), 'total count');
      assert.ok(html.includes('(2)'), 'error count');
      assert.ok(html.includes('(1)'), 'warning count');
      assert.ok(html.includes('data-severity="error"'));
      assert.ok(html.includes('data-severity="warning"'));
    });
  });

  describe('buildPerfBaselineHtml', () => {
    it('should render empty state for zero baselines', () => {
      const html = buildPerfBaselineHtml([]);
      assert.ok(html.includes('No performance baselines stored'));
    });

    it('should render baselines sorted by avg duration', () => {
      const html = buildPerfBaselineHtml([
        { normalizedSql: 'fast query', avgDurationMs: 5, sampleCount: 10, updatedAt: Date.now() },
        { normalizedSql: 'slow query', avgDurationMs: 200, sampleCount: 3, updatedAt: Date.now() },
      ]);
      assert.ok(html.includes('slow query'));
      assert.ok(html.includes('fast query'));
      assert.ok(html.includes('200ms'));
      assert.ok(html.includes('5ms'));
      // Slow row should have highlight class
      assert.ok(html.includes('slow-row'));
    });
  });

  describe('buildAnnotateFormHtml', () => {
    it('should render icon radio buttons and note textarea', () => {
      const html = buildAnnotateFormHtml({ kind: 'table', table: 'users' });
      // Should have all 7 annotation icon types as radio buttons
      assert.ok(html.includes('value="note"'));
      assert.ok(html.includes('value="warning"'));
      assert.ok(html.includes('value="bug"'));
      assert.ok(html.includes('value="star"'));
      assert.ok(html.includes('value="pin"'));
      assert.ok(html.includes('<textarea'));
      assert.ok(html.includes('table: users'));
    });

    it('should show column target when kind is column', () => {
      const html = buildAnnotateFormHtml({ kind: 'column', table: 'users', column: 'email' });
      assert.ok(html.includes('column: users.email'));
    });
  });

  describe('buildCompareFormHtml', () => {
    it('should render table selects and PK inputs for both rows', () => {
      const html = buildCompareFormHtml(['users', 'orders'], 'users');
      // Both selects should exist
      assert.ok(html.includes('id="tableA"'));
      assert.ok(html.includes('id="tableB"'));
      assert.ok(html.includes('id="pkA"'));
      assert.ok(html.includes('id="pkB"'));
      // Preselected table should be marked
      assert.ok(html.includes('selected'));
      // Scope radio buttons
      assert.ok(html.includes('value="same"'));
      assert.ok(html.includes('value="different"'));
    });
  });

  describe('buildBreakpointFormHtml', () => {
    it('should render table select and breakpoint type radios', () => {
      const html = buildBreakpointFormHtml(['users', 'orders']);
      assert.ok(html.includes('id="table"'));
      assert.ok(html.includes('value="conditionMet"'));
      assert.ok(html.includes('value="rowInserted"'));
      assert.ok(html.includes('value="rowDeleted"'));
      assert.ok(html.includes('value="rowChanged"'));
      // Condition textarea should exist but be hidden initially
      assert.ok(html.includes('id="condition"'));
      assert.ok(html.includes('condition-field'));
    });

    it('should preselect table when provided', () => {
      const html = buildBreakpointFormHtml(['users', 'orders'], 'orders');
      // orders option should have selected attribute
      const ordersMatch = html.match(/<option value="orders"([^>]*)>/);
      assert.ok(ordersMatch && ordersMatch[1].includes('selected'));
    });
  });

  describe('buildChangelogFormHtml', () => {
    it('should render from/to snapshot selects', () => {
      const html = buildChangelogFormHtml([
        { id: 'snap1', label: '2024-01-01', description: '3 table(s)' },
        { id: 'snap2', label: '2024-01-02', description: '3 table(s)' },
      ]);
      assert.ok(html.includes('id="from"'));
      assert.ok(html.includes('id="to"'));
      assert.ok(html.includes('snap1'));
      assert.ok(html.includes('snap2'));
      assert.ok(html.includes('Generate Changelog'));
    });
  });

  describe('buildImportFormHtml', () => {
    it('should render dataset radios and mode cards', () => {
      const html = buildImportFormHtml([
        { name: 'seed-data', path: '/data/seed.json' },
      ]);
      assert.ok(html.includes('seed-data'));
      assert.ok(html.includes('Browse for file'));
      assert.ok(html.includes('value="append"'));
      assert.ok(html.includes('value="replace"'));
      assert.ok(html.includes('value="sql"'));
    });

    it('should default-check browse when no named datasets', () => {
      const html = buildImportFormHtml([]);
      // The browse radio should be checked
      assert.ok(html.includes('value="__browse__" checked'));
    });
  });

  describe('buildExportFormHtml', () => {
    it('should render table checkboxes and name input', () => {
      const html = buildExportFormHtml([
        { name: 'users', rowCount: 10 },
        { name: 'orders', rowCount: 25 },
      ]);
      assert.ok(html.includes('id="name"'));
      assert.ok(html.includes('value="users"'));
      assert.ok(html.includes('value="orders"'));
      assert.ok(html.includes('10 rows'));
      assert.ok(html.includes('25 rows'));
      assert.ok(html.includes('Select all'));
      assert.ok(html.includes('Select none'));
    });
  });
});
