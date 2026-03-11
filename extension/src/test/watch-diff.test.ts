import * as assert from 'assert';
import { computeDiff, detectPkIndex, IWatchResult, rowKey } from '../watch/watch-diff';

describe('watch-diff', () => {
  describe('detectPkIndex()', () => {
    it('should use schema pk column when provided', () => {
      const cols = ['name', 'user_id', 'age'];
      const schema = [
        { name: 'name', type: 'TEXT', pk: false },
        { name: 'user_id', type: 'INTEGER', pk: true },
        { name: 'age', type: 'INTEGER', pk: false },
      ];
      assert.strictEqual(detectPkIndex(cols, schema), 1);
    });

    it('should fall back to id column name', () => {
      assert.strictEqual(detectPkIndex(['name', 'id', 'age']), 1);
    });

    it('should fall back to _id column name', () => {
      assert.strictEqual(detectPkIndex(['name', '_id', 'age']), 1);
    });

    it('should be case-insensitive for column names', () => {
      assert.strictEqual(detectPkIndex(['name', 'ID', 'age']), 1);
    });

    it('should fall back to index 0 when no pk found', () => {
      assert.strictEqual(detectPkIndex(['name', 'age']), 0);
    });

    it('should fall back to index 0 with empty schema', () => {
      const schema = [
        { name: 'name', type: 'TEXT', pk: false },
        { name: 'age', type: 'INTEGER', pk: false },
      ];
      assert.strictEqual(detectPkIndex(['name', 'age'], schema), 0);
    });
  });

  describe('rowKey()', () => {
    it('should stringify numeric pk', () => {
      assert.strictEqual(rowKey([42, 'Alice'], 0), '42');
    });

    it('should stringify string pk', () => {
      assert.strictEqual(rowKey(['abc', 1], 0), '"abc"');
    });

    it('should handle null pk', () => {
      assert.strictEqual(rowKey([null, 'x'], 0), 'null');
    });
  });

  describe('computeDiff()', () => {
    const cols = ['id', 'name', 'age'];

    function result(rows: unknown[][]): IWatchResult {
      return { columns: cols, rows };
    }

    it('should treat all rows as added when previous is null', () => {
      const current = result([[1, 'Alice', 30]]);
      const diff = computeDiff(null, current, 0);
      assert.strictEqual(diff.addedRows.length, 1);
      assert.strictEqual(diff.removedRows.length, 0);
      assert.strictEqual(diff.changedRows.length, 0);
      assert.strictEqual(diff.unchangedCount, 0);
    });

    it('should detect added rows', () => {
      const prev = result([[1, 'Alice', 30]]);
      const curr = result([[1, 'Alice', 30], [2, 'Bob', 25]]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.addedRows.length, 1);
      assert.deepStrictEqual(diff.addedRows[0], [2, 'Bob', 25]);
      assert.strictEqual(diff.unchangedCount, 1);
    });

    it('should detect removed rows', () => {
      const prev = result([[1, 'Alice', 30], [2, 'Bob', 25]]);
      const curr = result([[1, 'Alice', 30]]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.removedRows.length, 1);
      assert.deepStrictEqual(diff.removedRows[0], [2, 'Bob', 25]);
    });

    it('should detect changed rows and identify changed columns', () => {
      const prev = result([[1, 'Alice', 30]]);
      const curr = result([[1, 'Alice', 31]]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.changedRows.length, 1);
      assert.deepStrictEqual(diff.changedRows[0].changedColumnIndices, [2]);
      assert.strictEqual(diff.changedRows[0].pkValue, '1');
    });

    it('should count unchanged rows', () => {
      const prev = result([[1, 'Alice', 30], [2, 'Bob', 25]]);
      const curr = result([[1, 'Alice', 30], [2, 'Bob', 25]]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.unchangedCount, 2);
      assert.strictEqual(diff.addedRows.length, 0);
      assert.strictEqual(diff.removedRows.length, 0);
      assert.strictEqual(diff.changedRows.length, 0);
    });

    it('should handle empty current result', () => {
      const prev = result([[1, 'Alice', 30]]);
      const curr = result([]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.removedRows.length, 1);
      assert.strictEqual(diff.addedRows.length, 0);
    });

    it('should handle empty previous result', () => {
      const prev = result([]);
      const curr = result([[1, 'Alice', 30]]);
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.addedRows.length, 1);
      assert.strictEqual(diff.removedRows.length, 0);
    });

    it('should treat column changes as full replacement', () => {
      const prev: IWatchResult = { columns: ['id', 'name'], rows: [[1, 'Alice']] };
      const curr: IWatchResult = { columns: ['id', 'name', 'age'], rows: [[1, 'Alice', 30]] };
      const diff = computeDiff(prev, curr, 0);
      assert.strictEqual(diff.addedRows.length, 1);
      assert.strictEqual(diff.removedRows.length, 1);
    });
  });
});
