import * as assert from 'assert';
import * as sinon from 'sinon';
import { SamplingEngine, sqlLiteral } from '../sampling/sampling-engine';
import { zipRow } from '../shared-utils';
import type { DriftApiClient } from '../api-client';
import { makeMeta } from './sampling-test-helpers';

describe('SamplingEngine — edge cases', () => {
  it('should handle empty table gracefully', async () => {
    const sqlStub = sinon.stub();
    sqlStub.onFirstCall().resolves({ columns: ['cnt'], rows: [[0]] });
    sqlStub.onSecondCall().resolves({ columns: ['id'], rows: [] });

    const client = {
      schemaMetadata: sinon.stub().resolves([makeMeta()]),
      sql: sqlStub,
    } as unknown as DriftApiClient;

    const engine = new SamplingEngine(client);
    const result = await engine.sample({
      table: 'orders', mode: 'random', sampleSize: 10,
    });

    assert.strictEqual(result.totalRows, 0);
    assert.strictEqual(result.sampledRows, 0);
    assert.deepStrictEqual(result.rows, []);
  });
});

describe('sqlLiteral', () => {
  it('should quote strings with single quotes', () => {
    assert.strictEqual(sqlLiteral('hello'), "'hello'");
  });

  it('should escape embedded single quotes', () => {
    assert.strictEqual(sqlLiteral("O'Brien"), "'O''Brien'");
  });

  it('should return numbers as-is', () => {
    assert.strictEqual(sqlLiteral(42), '42');
    assert.strictEqual(sqlLiteral(3.14), '3.14');
  });

  it('should return NULL for null/undefined', () => {
    assert.strictEqual(sqlLiteral(null), 'NULL');
    assert.strictEqual(sqlLiteral(undefined), 'NULL');
  });
});

describe('zipRow', () => {
  it('should zip columns and row array into object', () => {
    const obj = zipRow(['a', 'b', 'c'], [1, 'two', null]);
    assert.deepStrictEqual(obj, { a: 1, b: 'two', c: null });
  });

  it('should handle empty arrays', () => {
    assert.deepStrictEqual(zipRow([], []), {});
  });
});
