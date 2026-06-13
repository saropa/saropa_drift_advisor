import * as assert from 'assert';
import type { PerformanceData } from '../api-types';
import { PerfBaselineStore } from '../debug/perf-baseline-store';
import {
  detectRegressions,
  recordSessionBaselines,
} from '../debug/perf-regression-detector';
import { normalizeSql } from '../diagnostics/utils/sql-utils';
import { MockMemento } from './vscode-mock-classes';

describe('normalizeSql', () => {
  it('should strip numeric literals', () => {
    assert.strictEqual(
      normalizeSql('SELECT * FROM users WHERE id = 42'),
      'select * from users where id = ?',
    );
  });

  it('should strip string literals', () => {
    assert.strictEqual(
      normalizeSql("SELECT * FROM users WHERE name = 'Alice'"),
      'select * from users where name = ?',
    );
  });

  it('should collapse whitespace and lowercase', () => {
    assert.strictEqual(
      normalizeSql('SELECT  *\n  FROM   Users'),
      'select * from users',
    );
  });

  it('should strip decimal literals', () => {
    assert.strictEqual(
      normalizeSql('SELECT * FROM products WHERE price > 19.99'),
      'select * from products where price > ?',
    );
  });

  it('should normalize two queries differing only in parameters', () => {
    const a = normalizeSql('SELECT * FROM users WHERE id = 1');
    const b = normalizeSql('SELECT * FROM users WHERE id = 999');
    assert.strictEqual(a, b);
  });
});

describe('PerfBaselineStore', () => {
  let memento: MockMemento;
  let store: PerfBaselineStore;

  beforeEach(() => {
    memento = new MockMemento();
    store = new PerfBaselineStore(memento as any);
  });

  // Audit M5: a corrupted/version-mismatched persisted value must not crash the
  // constructor; invalid entries are dropped.
  it('survives a corrupted persisted value (non-array)', () => {
    const bad = new MockMemento();
    bad.update('driftViewer.perfBaselines', { not: 'an array' });
    const s = new PerfBaselineStore(bad as any);
    assert.strictEqual(s.size, 0);
  });

  it('drops persisted entries missing normalizedSql', () => {
    const bad = new MockMemento();
    bad.update('driftViewer.perfBaselines', [{ foo: 1 }, null]);
    const s = new PerfBaselineStore(bad as any);
    assert.strictEqual(s.size, 0);
  });

  it('should start empty', () => {
    assert.strictEqual(store.size, 0);
    assert.strictEqual(store.get('anything'), undefined);
  });

  it('should record a new baseline', () => {
    store.record('select * from users where id = ?', 100);
    const b = store.get('select * from users where id = ?');
    assert.ok(b);
    assert.strictEqual(b.avgDurationMs, 100);
    assert.strictEqual(b.sampleCount, 1);
  });

  it('should compute moving average on subsequent records', () => {
    store.record('q', 100);
    store.record('q', 200);
    const b = store.get('q')!;
    // (100 * 1 + 200) / 2 = 150
    assert.strictEqual(b.avgDurationMs, 150);
    assert.strictEqual(b.sampleCount, 2);
  });

  it('should cap sample count at 20', () => {
    for (let i = 0; i < 25; i++) {
      store.record('q', 100);
    }
    const b = store.get('q')!;
    assert.ok(b.sampleCount <= 21);
  });

  it('should persist to memento', () => {
    store.record('q', 100);
    const raw = memento.get<any[]>('driftViewer.perfBaselines', [])!;
    assert.strictEqual(raw.length, 1);
    assert.strictEqual(raw[0].normalizedSql, 'q');
  });

  it('should restore from memento', () => {
    store.record('q', 100);
    const store2 = new PerfBaselineStore(memento as any);
    assert.strictEqual(store2.size, 1);
    assert.strictEqual(store2.get('q')?.avgDurationMs, 100);
  });

  it('should resetOne', () => {
    store.record('a', 100);
    store.record('b', 200);
    assert.strictEqual(store.resetOne('a'), true);
    assert.strictEqual(store.size, 1);
    assert.strictEqual(store.get('a'), undefined);
  });

  it('should return false for resetOne on missing key', () => {
    assert.strictEqual(store.resetOne('missing'), false);
  });

  it('should resetAll', () => {
    store.record('a', 100);
    store.record('b', 200);
    store.resetAll();
    assert.strictEqual(store.size, 0);
  });

  it('should notify listeners on change', () => {
    let called = 0;
    store.onDidChange(() => { called++; });
    store.record('q', 100);
    assert.strictEqual(called, 1);
    store.record('q', 200);
    assert.strictEqual(called, 2);
  });

  it('should dispose listener', () => {
    let called = 0;
    const sub = store.onDidChange(() => { called++; });
    store.record('q', 100);
    sub.dispose();
    store.record('q', 200);
    assert.strictEqual(called, 1);
  });
});

describe('detectRegressions', () => {
  let memento: MockMemento;
  let store: PerfBaselineStore;

  const makeData = (
    slowQueries: PerformanceData['slowQueries'],
    recentQueries: PerformanceData['recentQueries'] = [],
  ): PerformanceData => ({
    totalQueries: slowQueries.length + recentQueries.length,
    totalDurationMs: 0,
    avgDurationMs: 0,
    slowQueries,
    recentQueries,
  });

  beforeEach(() => {
    memento = new MockMemento();
    store = new PerfBaselineStore(memento as any);
  });

  it('should return empty when no baselines exist', () => {
    const data = makeData([
      { sql: 'SELECT * FROM users WHERE id = 1', durationMs: 500, rowCount: 1, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 0);
  });

  it('should detect a regression when query is slower than threshold', () => {
    // Baseline: 100ms average
    store.record('select * from users where id = ?', 100);

    // Current session: 250ms (2.5x baseline)
    const data = makeData([
      { sql: 'SELECT * FROM users WHERE id = 42', durationMs: 250, rowCount: 1, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].currentAvgMs, 250);
    assert.strictEqual(result[0].baselineAvgMs, 100);
    assert.strictEqual(result[0].ratio, 2.5);
  });

  it('should not flag queries under threshold', () => {
    store.record('select * from users where id = ?', 100);

    const data = makeData([
      { sql: 'SELECT * FROM users WHERE id = 42', durationMs: 150, rowCount: 1, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 0);
  });

  it('should aggregate multiple executions of the same query', () => {
    store.record('select * from users where id = ?', 100);

    const data = makeData(
      [{ sql: 'SELECT * FROM users WHERE id = 1', durationMs: 300, rowCount: 1, at: '' }],
      [{ sql: 'SELECT * FROM users WHERE id = 2', durationMs: 100, rowCount: 1, at: '' }],
    );
    // Average = (300 + 100) / 2 = 200, ratio = 2.0
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].currentAvgMs, 200);
  });

  it('should sort regressions by ratio descending', () => {
    store.record('select * from a', 100);
    store.record('select * from b', 100);

    const data = makeData([
      { sql: 'SELECT * FROM a', durationMs: 300, rowCount: 0, at: '' },
      { sql: 'SELECT * FROM b', durationMs: 500, rowCount: 0, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 2);
    assert.ok(result[0].ratio >= result[1].ratio);
  });

  it('should skip baselines with sampleCount < 1', () => {
    // Manually create a baseline with 0 samples (edge case)
    memento.update('driftViewer.perfBaselines', [
      { normalizedSql: 'q', avgDurationMs: 100, sampleCount: 0, updatedAt: 0 },
    ]);
    const store2 = new PerfBaselineStore(memento as any);

    const data = makeData([
      { sql: 'Q', durationMs: 500, rowCount: 0, at: '' },
    ]);
    const result = detectRegressions(data, store2, 2.0);
    assert.strictEqual(result.length, 0);
  });

  it('should skip baselines with zero avgDurationMs', () => {
    memento.update('driftViewer.perfBaselines', [
      { normalizedSql: 'select * from x', avgDurationMs: 0, sampleCount: 5, updatedAt: 0 },
    ]);
    const store2 = new PerfBaselineStore(memento as any);

    const data = makeData([
      { sql: 'SELECT * FROM x', durationMs: 100, rowCount: 0, at: '' },
    ]);
    const result = detectRegressions(data, store2, 2.0);
    assert.strictEqual(result.length, 0);
  });

  it('should return empty for empty query data', () => {
    store.record('select * from users', 100);
    const data = makeData([], []);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 0);
  });

  // Regression tests for
  // BUG_perf_regression_false_positives_from_data_quality_probes.md Suggestion #2
  // (row-count / cold-vs-warm normalization, deferred from the isInternal fix).
  it('should NOT flag a query whose time grew only because its table grew', () => {
    // Baseline: 100ms returning 100 rows (1ms/row). Recorded WITH a row count so
    // the detector takes the per-row path.
    store.record('select * from items', 100, 100);

    // This session: 1000 rows at 1000ms — same 1ms/row, table just 10x bigger.
    const data = makeData([
      { sql: 'SELECT * FROM items', durationMs: 1000, rowCount: 1000, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(
      result.length,
      0,
      'pure table growth (same per-row cost) must not be a regression',
    );
  });

  it('should flag a genuine per-row slowdown even when row count is unchanged', () => {
    store.record('select * from items', 100, 100); // 1ms/row baseline

    // Same 100 rows but 5ms/row now — a real regression.
    const data = makeData([
      { sql: 'SELECT * FROM items', durationMs: 500, rowCount: 100, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rowCountNormalized, true);
    assert.strictEqual(result[0].ratio, 5);
    assert.strictEqual(result[0].currentRowCount, 100);
    assert.strictEqual(result[0].baselineRowCount, 100);
  });

  it('should flag a per-row slowdown that raw timing would hide (fewer rows now)', () => {
    store.record('select * from items', 100, 100); // 1ms/row baseline

    // Only 10 rows now but 50ms — raw is 0.5x (faster!) yet 5ms/row is 5x worse.
    const data = makeData([
      { sql: 'SELECT * FROM items', durationMs: 50, rowCount: 10, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rowCountNormalized, true);
    assert.strictEqual(result[0].ratio, 5);
  });

  it('should fall back to raw comparison when the baseline has no row count', () => {
    // Pre-row-count baseline (two-arg record): must behave exactly as before.
    store.record('select * from items', 100);
    const data = makeData([
      { sql: 'SELECT * FROM items', durationMs: 250, rowCount: 9999, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rowCountNormalized, false);
    assert.strictEqual(result[0].ratio, 2.5);
  });

  it('should fall back to raw comparison when this session returned zero rows', () => {
    store.record('update items set x = ?', 100, 5);
    const data = makeData([
      { sql: 'UPDATE items SET x = 1', durationMs: 300, rowCount: 0, at: '' },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rowCountNormalized, false);
    assert.strictEqual(result[0].ratio, 3);
  });

  it('recordSessionBaselines should persist a rolling avgRowCount', () => {
    const data = makeData([
      { sql: 'SELECT * FROM items', durationMs: 100, rowCount: 40, at: '' },
      { sql: 'SELECT * FROM items', durationMs: 200, rowCount: 60, at: '' },
    ]);
    recordSessionBaselines(data, store);
    const b = store.get('select * from items')!;
    assert.strictEqual(b.avgDurationMs, 150); // (100+200)/2
    assert.strictEqual(b.avgRowCount, 50); // (40+60)/2
  });

  it('should skip isInternal=true queries (extension-owned probes)', () => {
    // Regression test for
    // BUG_perf_regression_false_positives_from_data_quality_probes.md:
    // without this filter every debug session fires a false-positive
    // warning comparing the extension's own null-count probe to a
    // baseline captured from a prior run of the probe itself.
    store.record(
      'select sum(case when "id" is null then ? else ? end) as ?, ? from ?',
      6,
    );

    const data = makeData([
      {
        sql: 'SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", COUNT(*) FROM "affirmations"',
        durationMs: 55,
        rowCount: 1,
        at: '',
        isInternal: true,
      },
    ]);
    const result = detectRegressions(data, store, 2.0);
    assert.strictEqual(result.length, 0,
      'extension-owned probes must never trigger regression warnings');
  });
});

describe('recordSessionBaselines', () => {
  let memento: MockMemento;
  let store: PerfBaselineStore;

  beforeEach(() => {
    memento = new MockMemento();
    store = new PerfBaselineStore(memento as any);
  });

  it('should record baselines for all queries in session', () => {
    const data: PerformanceData = {
      totalQueries: 2,
      totalDurationMs: 0,
      avgDurationMs: 0,
      slowQueries: [
        { sql: 'SELECT * FROM users WHERE id = 1', durationMs: 100, rowCount: 1, at: '' },
      ],
      recentQueries: [
        { sql: 'INSERT INTO posts VALUES (1)', durationMs: 50, rowCount: 1, at: '' },
      ],
    };

    recordSessionBaselines(data, store);
    assert.strictEqual(store.size, 2);
    assert.ok(store.get('select * from users where id = ?'));
    assert.ok(store.get('insert into posts values (?)'));
  });

  it('should update existing baselines with session averages', () => {
    store.record('select * from users where id = ?', 100);

    const data: PerformanceData = {
      totalQueries: 1,
      totalDurationMs: 0,
      avgDurationMs: 0,
      slowQueries: [
        { sql: 'SELECT * FROM users WHERE id = 42', durationMs: 200, rowCount: 1, at: '' },
      ],
      recentQueries: [],
    };

    recordSessionBaselines(data, store);
    const b = store.get('select * from users where id = ?')!;
    assert.strictEqual(b.sampleCount, 2);
    // (100 * 1 + 200) / 2 = 150
    assert.strictEqual(b.avgDurationMs, 150);
  });
});
