import * as assert from 'assert';
import * as sinon from 'sinon';
import { QueryIntelligence } from '../engines/query-intelligence';
import type { DriftApiClient } from '../api-client';
import type { PerformanceData } from '../api-types';

// Audit M3: _getPerformance re-fetches the whole rolling perf window on every
// TTL refresh. Without a dedup cursor it re-ingested every query each time,
// inflating executionCount (and thus slow-query / index advice). Each server
// query must be folded into the pattern store exactly once.
describe('QueryIntelligence — perf ingest dedup (M3)', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });
  afterEach(() => {
    clock.restore();
  });

  function client(perf: PerformanceData): DriftApiClient {
    return {
      performance: async () => perf,
    } as unknown as DriftApiClient;
  }

  it('counts each server query once across cache refreshes', async () => {
    const perf: PerformanceData = {
      totalQueries: 1,
      totalDurationMs: 200,
      avgDurationMs: 200,
      slowQueries: [],
      recentQueries: [
        {
          sql: 'SELECT * FROM t WHERE id = 1',
          durationMs: 200,
          rowCount: 1,
          at: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const engine = new QueryIntelligence(client(perf));

    // First refresh ingests the query.
    await engine.getRecentQueries();
    const first = await engine.analyzeQuery('SELECT * FROM t WHERE id = 2');
    assert.strictEqual(first.pattern?.executionCount, 1);

    // Advance past the cache TTL so the next call refetches the same window.
    await clock.tickAsync(120_000);
    await engine.getRecentQueries();

    const second = await engine.analyzeQuery('SELECT * FROM t WHERE id = 3');
    assert.strictEqual(
      second.pattern?.executionCount,
      1,
      'the same server query must not be re-ingested on refresh',
    );

    engine.dispose();
  });

  it('ingests a genuinely newer query on a later refresh', async () => {
    const perf: PerformanceData = {
      totalQueries: 1,
      totalDurationMs: 10,
      avgDurationMs: 10,
      slowQueries: [],
      recentQueries: [
        { sql: 'SELECT * FROM t WHERE id = 1', durationMs: 10, rowCount: 1, at: '2026-01-01T00:00:00.000Z' },
      ],
    };
    const engine = new QueryIntelligence(client(perf));
    await engine.getRecentQueries();

    // A newer occurrence of the same pattern arrives in the window.
    perf.recentQueries.push({
      sql: 'SELECT * FROM t WHERE id = 9',
      durationMs: 10,
      rowCount: 1,
      at: '2026-01-01T00:05:00.000Z',
    });
    await clock.tickAsync(120_000);
    await engine.getRecentQueries();

    const p = await engine.analyzeQuery('SELECT * FROM t WHERE id = 0');
    assert.strictEqual(p.pattern?.executionCount, 2, 'newer query is counted');
    engine.dispose();
  });
});
