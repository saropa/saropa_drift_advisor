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
