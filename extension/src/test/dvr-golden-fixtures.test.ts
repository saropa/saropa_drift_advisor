/**
 * Golden JSON fixtures for DVR envelope + recorded query parsing (regression guard).
 */

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  parseDvrEnvelope,
  parseDvrStatusData,
  parseRecordedQueryV1,
  tryParseDvrQueryNotAvailable,
} from '../dvr/dvr-client';

/** Mocha runs compiled tests under `out/test/`; JSON fixtures stay in `src/test/fixtures`. */
function readFixture(name: string): unknown {
  const extRoot = path.join(__dirname, '..', '..');
  const p = path.join(extRoot, 'src', 'test', 'fixtures', 'dvr', name);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
}

describe('DVR golden fixtures', () => {
  it('parses golden envelope status payload', () => {
    const raw = readFixture('golden-envelope-v1.json');
    const env = parseDvrEnvelope<Record<string, unknown>>(raw, 'golden');
    const s = parseDvrStatusData(env.data);
    assert.equal(s.sessionId, 'sess-golden');
    assert.equal(s.queryCount, 2);
    assert.equal(s.maxQueries, 500);
  });

  it('parses golden recorded query row (forward-compatible fields)', () => {
    const raw = readFixture('golden-recorded-query-v1.json');
    const row = parseRecordedQueryV1(raw);
    assert.equal(row.id, 7);
    assert.equal(row.sql.includes('items'), true);
    assert.equal(row.params.positional[0], 42);
    assert.equal(row.params.named.limit, 10);
    assert.equal(row.durationMs, 3.5);
  });

  it('parses QUERY_NOT_AVAILABLE golden envelope', () => {
    const raw = readFixture('golden-dvr-query-not-available.json');
    const err = tryParseDvrQueryNotAvailable(raw, 'sess-x', 99);
    assert.ok(err);
    assert.equal(err!.code, 'QUERY_NOT_AVAILABLE');
    assert.equal(err!.details.maxAvailableId, 20);
  });

  it('parses legacy rowCount golden fixture for select', () => {
    const raw = readFixture('golden-recorded-legacy-rowcount-select.json');
    const row = parseRecordedQueryV1(raw);
    assert.equal(row.resultRowCount, 99);
  });

  it('parses recorded row with missing params (defaults empty)', () => {
    const raw = readFixture('golden-recorded-missing-params.json');
    const row = parseRecordedQueryV1(raw);
    assert.deepEqual(row.params.positional, []);
    assert.deepEqual(row.params.named, {});
    assert.equal(row.type, 'delete');
  });
});
