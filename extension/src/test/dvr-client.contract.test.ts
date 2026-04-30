/**
 * Contract tests for DVR JSON parsing (envelopes, legacy fields, errors).
 */

import * as assert from 'node:assert';
import {
  parseDvrEnvelope,
  parseDvrStatusData,
  parseRecordedQueryV1,
  tryParseDvrQueryNotAvailable,
} from '../dvr/dvr-client';

describe('parseDvrEnvelope', () => {
  it('accepts schemaVersion 1', () => {
    const e = parseDvrEnvelope<{ a: number }>(
      { schemaVersion: 1, generatedAt: 't', data: { a: 1 } },
      'test',
    );
    assert.equal(e.data.a, 1);
  });

  it('ignores unknown top-level envelope fields (forward compatibility)', () => {
    const e = parseDvrEnvelope<{ x: number }>(
      { schemaVersion: 1, generatedAt: 't', data: { x: 2 }, futureFlag: true },
      'test',
    );
    assert.equal(e.data.x, 2);
  });

  it('rejects unknown schemaVersion', () => {
    assert.throws(() => parseDvrEnvelope({ schemaVersion: 2, data: {} }, 'x'));
  });
});

describe('parseRecordedQueryV1', () => {
  it('maps legacy rowCount onto resultRowCount for selects', () => {
    const row = parseRecordedQueryV1({
      sessionId: 's',
      id: 1,
      sequence: 1,
      sql: 'SELECT 1',
      params: { positional: [], named: {} },
      type: 'select',
      timestamp: 't',
      durationMs: 1,
      affectedRowCount: 0,
      resultRowCount: 0,
      table: null,
      beforeState: null,
      afterState: null,
      rowCount: 42,
    });
    assert.equal(row.resultRowCount, 42);
  });

  it('maps missing sessionId to legacy-session', () => {
    const row = parseRecordedQueryV1({
      id: 1,
      sequence: 1,
      sql: 'SELECT 1',
      params: { positional: [], named: {} },
      type: 'select',
      timestamp: 't',
      durationMs: 1,
      affectedRowCount: 0,
      resultRowCount: 1,
      table: null,
      beforeState: null,
      afterState: null,
    });
    assert.equal(row.sessionId, 'legacy-session');
  });

  it('maps legacy rowCount onto affectedRowCount for writes', () => {
    const row = parseRecordedQueryV1({
      sessionId: 's',
      id: 1,
      sequence: 1,
      sql: 'UPDATE t SET x=1',
      params: { positional: [], named: {} },
      type: 'update',
      timestamp: 't',
      durationMs: 1,
      affectedRowCount: 0,
      resultRowCount: 0,
      table: 't',
      beforeState: null,
      afterState: null,
      rowCount: 3,
    });
    assert.equal(row.affectedRowCount, 3);
  });
});

describe('parseDvrStatusData', () => {
  it('passes through optional DVR config fields', () => {
    const s = parseDvrStatusData({
      recording: true,
      queryCount: 2,
      sessionId: 'abc',
      minAvailableId: 0,
      maxAvailableId: 1,
      maxQueries: 100,
      captureBeforeAfter: false,
    });
    assert.equal(s.maxQueries, 100);
    assert.equal(s.captureBeforeAfter, false);
  });
});

describe('tryParseDvrQueryNotAvailable', () => {
  it('returns structured error for QUERY_NOT_AVAILABLE', () => {
    const err = tryParseDvrQueryNotAvailable(
      {
        schemaVersion: 1,
        error: 'QUERY_NOT_AVAILABLE',
        message: 'gone',
        data: { sessionId: 's', requestedId: 9, minAvailableId: 1, maxAvailableId: 3 },
      },
      's',
      9,
    );
    assert.ok(err);
    assert.equal(err!.code, 'QUERY_NOT_AVAILABLE');
    assert.equal(err!.details.minAvailableId, 1);
  });

  it('returns null for unrelated payloads', () => {
    assert.equal(tryParseDvrQueryNotAvailable({ error: 'OTHER' }, 's', 1), null);
  });
});
