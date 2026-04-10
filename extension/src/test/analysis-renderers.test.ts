/**
 * Tests for analysis-renderers — type-specific HTML renderers and diff summarizers.
 * Verifies rendering output contains expected content, and diff summaries correctly
 * identify added/removed/changed items between two snapshots.
 */

import * as assert from 'assert';
import {
  renderIndexSuggestions,
  summarizeIndexDiff,
  renderSizeAnalytics,
  summarizeSizeDiff,
  renderAnomalies,
  summarizeAnomalyDiff,
  renderHealthScore,
  summarizeHealthDiff,
} from '../analysis-history/analysis-renderers';
import type { IndexSuggestion, Anomaly, ISizeAnalytics } from '../api-types';
import type { IHealthScore } from '../health/health-types';

// ---- Index Suggestions ----

describe('renderIndexSuggestions', () => {
  it('should show empty message for empty array', () => {
    const html = renderIndexSuggestions([]);
    assert.ok(html.includes('No missing indexes'));
  });

  it('should render table with suggestion data', () => {
    const suggestions: IndexSuggestion[] = [
      { table: 'orders', column: 'user_id', reason: 'FK column', sql: 'CREATE INDEX ...', priority: 'high' },
    ];
    const html = renderIndexSuggestions(suggestions);
    assert.ok(html.includes('orders'), 'should contain table name');
    assert.ok(html.includes('user_id'), 'should contain column name');
    assert.ok(html.includes('priority-high'), 'should contain priority class');
    assert.ok(html.includes('1 suggestion(s)'), 'should contain count');
  });
});

describe('summarizeIndexDiff', () => {
  it('should report no changes when before and after are identical', () => {
    const suggestions: IndexSuggestion[] = [
      { table: 'orders', column: 'user_id', reason: 'FK', sql: 'CREATE INDEX ...', priority: 'high' },
    ];
    const summary = summarizeIndexDiff(suggestions, suggestions);
    assert.ok(summary.includes('No changes'));
  });

  it('should report resolved and new suggestions', () => {
    const before: IndexSuggestion[] = [
      { table: 'orders', column: 'user_id', reason: 'FK', sql: '...', priority: 'high' },
      { table: 'products', column: 'cat_id', reason: 'FK', sql: '...', priority: 'medium' },
    ];
    const after: IndexSuggestion[] = [
      { table: 'orders', column: 'user_id', reason: 'FK', sql: '...', priority: 'high' },
      { table: 'users', column: 'email', reason: 'WHERE', sql: '...', priority: 'low' },
    ];
    const summary = summarizeIndexDiff(before, after);
    assert.ok(summary.includes('Resolved: products.cat_id'), 'should list resolved');
    assert.ok(summary.includes('New: users.email'), 'should list new');
  });
});

// ---- Size Analytics ----

function makeSizeData(overrides?: Partial<ISizeAnalytics>): ISizeAnalytics {
  return {
    pageSize: 4096,
    pageCount: 10,
    totalSizeBytes: 40960,
    freeSpaceBytes: 0,
    usedSizeBytes: 40960,
    journalMode: 'wal',
    tableCount: 1,
    tables: [{ table: 'users', rowCount: 10, columnCount: 2, indexCount: 0, indexes: [] }],
    ...overrides,
  };
}

describe('renderSizeAnalytics', () => {
  it('should render size summary and table data', () => {
    const html = renderSizeAnalytics(makeSizeData());
    assert.ok(html.includes('40.0 KB'), 'should contain formatted total size');
    assert.ok(html.includes('users'), 'should contain table name');
    assert.ok(html.includes('1 table(s)'), 'should contain table count');
  });
});

describe('summarizeSizeDiff', () => {
  it('should report size and row deltas', () => {
    const before = makeSizeData({ totalSizeBytes: 40960 });
    const after = makeSizeData({
      totalSizeBytes: 81920,
      usedSizeBytes: 81920,
      tables: [{ table: 'users', rowCount: 50, columnCount: 2, indexCount: 0, indexes: [] }],
    });
    const summary = summarizeSizeDiff(before, after);
    assert.ok(summary.includes('40.0 KB'), 'should contain before size');
    assert.ok(summary.includes('80.0 KB'), 'should contain after size');
    assert.ok(summary.includes('+40'), 'should contain row delta');
  });

  it('should report table count changes', () => {
    const before = makeSizeData({ tableCount: 2 });
    const after = makeSizeData({ tableCount: 5 });
    const summary = summarizeSizeDiff(before, after);
    assert.ok(summary.includes('Tables: 2'), 'should show before table count');
    assert.ok(summary.includes('5'), 'should show after table count');
  });
});

// ---- Anomalies ----

describe('renderAnomalies', () => {
  it('should show empty message for empty array', () => {
    const html = renderAnomalies([]);
    assert.ok(html.includes('No anomalies found'));
  });

  it('should render severity icons and messages', () => {
    const anomalies: Anomaly[] = [
      { message: 'Orphaned rows in orders.user_id', severity: 'error' },
      { message: 'Duplicate rows in products', severity: 'warning' },
    ];
    const html = renderAnomalies(anomalies);
    assert.ok(html.includes('Orphaned rows'), 'should contain error message');
    assert.ok(html.includes('sev-error'), 'should contain error class');
    assert.ok(html.includes('sev-warning'), 'should contain warning class');
    assert.ok(html.includes('2 anomaly(ies)'), 'should contain count');
  });
});

describe('summarizeAnomalyDiff', () => {
  it('should report resolved and new anomalies', () => {
    const before: Anomaly[] = [
      { message: 'Orphaned FK rows', severity: 'error' },
      { message: 'Duplicate rows', severity: 'warning' },
    ];
    const after: Anomaly[] = [
      { message: 'Orphaned FK rows', severity: 'error' },
      { message: 'Empty strings in name', severity: 'info' },
    ];
    const summary = summarizeAnomalyDiff(before, after);
    assert.ok(summary.includes('1 resolved'), 'should report resolved count');
    assert.ok(summary.includes('1 new'), 'should report new count');
  });

  it('should include severity breakdown', () => {
    const before: Anomaly[] = [
      { message: 'A', severity: 'error' },
      { message: 'B', severity: 'warning' },
    ];
    const summary = summarizeAnomalyDiff(before, []);
    assert.ok(summary.includes('1E/1W/0I'), 'should contain before breakdown');
    assert.ok(summary.includes('0E/0W/0I'), 'should contain after breakdown');
  });
});

// ---- Health Score ----

function makeHealthScore(overrides?: Partial<IHealthScore>): IHealthScore {
  return {
    overall: 85,
    grade: 'B',
    metrics: [
      {
        name: 'Index Coverage', key: 'indexCoverage' as const,
        score: 90, grade: 'A-', weight: 0.25,
        summary: '10/10 indexed', details: [],
      },
    ],
    recommendations: [],
    ...overrides,
  };
}

describe('renderHealthScore', () => {
  it('should render grade and overall score', () => {
    const html = renderHealthScore(makeHealthScore());
    assert.ok(html.includes('85/100'), 'should contain overall score');
    assert.ok(html.includes('>B<'), 'should contain grade');
    assert.ok(html.includes('Index Coverage'), 'should contain metric name');
  });
});

describe('summarizeHealthDiff', () => {
  it('should report overall change and delta', () => {
    const before = makeHealthScore({ overall: 70, grade: 'C' });
    const after = makeHealthScore({ overall: 85, grade: 'B' });
    const summary = summarizeHealthDiff(before, after);
    assert.ok(summary.includes('70/100 (C)'), 'should contain before score');
    assert.ok(summary.includes('85/100 (B)'), 'should contain after score');
    assert.ok(summary.includes('+15'), 'should contain delta');
  });

  it('should report notable metric changes (>= 5 points)', () => {
    const before = makeHealthScore({
      metrics: [
        { name: 'Index Coverage', key: 'indexCoverage' as const, score: 60, grade: 'D', weight: 0.25, summary: '', details: [] },
        { name: 'FK Integrity', key: 'fkIntegrity' as const, score: 90, grade: 'A-', weight: 0.20, summary: '', details: [] },
      ],
    });
    const after = makeHealthScore({
      metrics: [
        { name: 'Index Coverage', key: 'indexCoverage' as const, score: 90, grade: 'A-', weight: 0.25, summary: '', details: [] },
        { name: 'FK Integrity', key: 'fkIntegrity' as const, score: 88, grade: 'B+', weight: 0.20, summary: '', details: [] },
      ],
    });
    const summary = summarizeHealthDiff(before, after);
    assert.ok(summary.includes('Index Coverage: +30'), 'should show large metric change');
    // FK Integrity only dropped 2 points — should NOT appear in notable changes
    assert.ok(!summary.includes('FK Integrity'), 'should not show small metric change');
  });

  it('should omit notable changes section when no metrics changed significantly', () => {
    const score = makeHealthScore();
    const summary = summarizeHealthDiff(score, score);
    assert.ok(!summary.includes('Notable changes'), 'should omit notable changes');
  });
});
