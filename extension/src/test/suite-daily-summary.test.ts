import * as assert from 'node:assert';
import type { DriftApiClient } from '../api-client';
import type { Anomaly, IndexSuggestion, PerformanceData, QueryEntry } from '../api-types';
import { buildDailySummary } from '../suite/suite-daily-summary';

/** Minimal stub client exposing only the three methods buildDailySummary reads. */
function stubClient(over: {
  performance?: PerformanceData;
  anomalies?: Anomaly[];
  indexSuggestions?: IndexSuggestion[];
  performanceThrows?: boolean;
}): DriftApiClient {
  return {
    performance: async () => {
      if (over.performanceThrows) throw new Error('boom');
      return (
        over.performance ?? {
          totalQueries: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
          slowQueries: [],
          recentQueries: [],
        }
      );
    },
    anomalies: async () => over.anomalies ?? [],
    indexSuggestions: async () => over.indexSuggestions ?? [],
  } as unknown as DriftApiClient;
}

function slow(durationMs: number, sql = 'SELECT * FROM t'): QueryEntry {
  return { sql, durationMs, rowCount: 1, at: '2026-07-16T00:00:00Z' };
}

describe('buildDailySummary', () => {
  it('returns undefined when no client is connected', async () => {
    assert.strictEqual(await buildDailySummary(null, '2026-07-16'), undefined);
  });

  it('echoes the requested date and stable tool id', async () => {
    const s = await buildDailySummary(stubClient({}), '2026-07-16');
    assert.ok(s);
    assert.strictEqual(s.date, '2026-07-16');
    assert.strictEqual(s.tool, 'drift-viewer');
    assert.strictEqual(s.openCommand, 'driftViewer.openInPanel');
  });

  it('builds real counts and headline from observed data', async () => {
    const s = await buildDailySummary(
      stubClient({
        performance: {
          totalQueries: 12,
          totalDurationMs: 900,
          avgDurationMs: 75,
          slowQueries: [slow(800), slow(600)],
          recentQueries: [],
        },
        anomalies: [{ message: 'Orphan rows', severity: 'warning', table: 'orders' }],
        indexSuggestions: [
          { table: 'orders', column: 'userId', reason: 'FK scan', sql: 'CREATE INDEX ...', priority: 'high' },
        ],
      }),
      '2026-07-16',
    );
    assert.ok(s);
    assert.deepStrictEqual(s.counts, {
      queries: 12,
      slowQueries: 2,
      anomalies: 1,
      indexSuggestions: 1,
    });
    assert.match(s.headline, /12 queries observed/);
    assert.match(s.headline, /2 slow/);
    assert.match(s.headline, /1 anomaly/);
  });

  it('lists anomalies then worst slow queries in trouble, capped and sorted', async () => {
    const s = await buildDailySummary(
      stubClient({
        performance: {
          totalQueries: 10,
          totalDurationMs: 0,
          avgDurationMs: 0,
          // seven slow queries; only the five worst survive the cap
          slowQueries: [slow(100), slow(700), slow(200), slow(900), slow(300), slow(800), slow(50)],
          recentQueries: [],
        },
        anomalies: [{ message: 'Dup key', severity: 'error', table: 'users', column: 'email' }],
      }),
      '2026-07-16',
    );
    assert.ok(s);
    // First item is the anomaly with table.column detail and its deep-link.
    assert.strictEqual(s.trouble[0].label, 'Dup key');
    assert.strictEqual(s.trouble[0].detail, 'users.email');
    assert.strictEqual(s.trouble[0].command, 'driftViewer.showAnomalies');

    const slowItems = s.trouble.slice(1);
    assert.strictEqual(slowItems.length, 5); // MAX_TROUBLE_SLOW_QUERIES
    assert.strictEqual(slowItems[0].label, 'Slow query (900ms)');
    assert.strictEqual(slowItems[0].command, 'driftViewer.showQueryDetail');
    // Descending by duration: 900, 800, 700, 300, 200.
    const durations = slowItems.map((t) => Number(/\((\d+)ms\)/.exec(t.label)![1]));
    assert.deepStrictEqual(durations, [900, 800, 700, 300, 200]);
  });

  it('carries the raw QueryEntry as args and a table-only detail', async () => {
    const q = slow(500, 'SELECT * FROM audit');
    const s = await buildDailySummary(
      stubClient({
        performance: {
          totalQueries: 1,
          totalDurationMs: 500,
          avgDurationMs: 500,
          slowQueries: [q],
          recentQueries: [],
        },
        // Anomaly with a table but no column -> detail is the bare table name.
        anomalies: [{ message: 'Missing FK', severity: 'info', table: 'audit' }],
      }),
      '2026-07-16',
    );
    assert.ok(s);
    assert.strictEqual(s.trouble[0].detail, 'audit');
    assert.strictEqual(s.trouble[1].args, q); // same reference, not a copy
  });

  it('degrades a failed fetch to zero without failing the whole call', async () => {
    const s = await buildDailySummary(stubClient({ performanceThrows: true }), '2026-07-16');
    assert.ok(s);
    assert.strictEqual(s.counts.queries, 0);
    assert.strictEqual(s.counts.slowQueries, 0);
    assert.match(s.headline, /No database activity observed/);
  });
});
