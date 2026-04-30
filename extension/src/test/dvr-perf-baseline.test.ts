/**
 * Tests DVR timeline → perf baseline integration (regression detector feed).
 */

import * as assert from 'assert';

import type { IRecordedQueryV1 } from '../api-types';
import { PerfBaselineStore } from '../debug/perf-baseline-store';
import {
  buildPerformanceDataFromDvrQueries,
  recordDvrQueriesIntoPerfBaselines,
} from '../debug/perf-regression-detector';
import { MockMemento } from './vscode-mock-classes';

describe('recordDvrQueriesIntoPerfBaselines', () => {
  it('records normalized keys from DVR rows', () => {
    const store = new PerfBaselineStore(new MockMemento() as any);
    const rows: IRecordedQueryV1[] = [
      {
        sessionId: 's',
        id: 1,
        sequence: 1,
        sql: 'SELECT * FROM users WHERE id = 7',
        params: { positional: [], named: {} },
        type: 'select',
        timestamp: 't',
        durationMs: 40,
        affectedRowCount: 0,
        resultRowCount: 1,
        table: 'users',
        beforeState: null,
        afterState: null,
      },
    ];
    recordDvrQueriesIntoPerfBaselines(rows, store);
    assert.ok(store.size >= 1);
    const hit = store.get('select * from users where id = ?');
    assert.ok(hit);
    assert.strictEqual(hit!.sampleCount, 1);
  });
});

describe('buildPerformanceDataFromDvrQueries', () => {
  it('splits slow vs recent using slowThresholdMs', () => {
    const rows: IRecordedQueryV1[] = [
      {
        sessionId: 's',
        id: 1,
        sequence: 1,
        sql: 'SELECT 1',
        params: { positional: [], named: {} },
        type: 'select',
        timestamp: 't1',
        durationMs: 10,
        affectedRowCount: 0,
        resultRowCount: 1,
        table: null,
        beforeState: null,
        afterState: null,
      },
      {
        sessionId: 's',
        id: 2,
        sequence: 2,
        sql: 'SELECT 2',
        params: { positional: [], named: {} },
        type: 'select',
        timestamp: 't2',
        durationMs: 600,
        affectedRowCount: 0,
        resultRowCount: 1,
        table: null,
        beforeState: null,
        afterState: null,
      },
    ];
    const data = buildPerformanceDataFromDvrQueries(rows, 500);
    assert.strictEqual(data.recentQueries.length, 2);
    assert.strictEqual(data.slowQueries.length, 1);
    assert.strictEqual(data.slowQueries[0].sql, 'SELECT 2');
  });
});
