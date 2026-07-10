import * as assert from 'assert';
import { computeTableDiff } from '../timeline/snapshot-store';

describe('computeTableDiff', () => {
  it('should identify added rows by PK', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      1, 2,
    );
    assert.strictEqual(diff.addedRows.length, 1);
    assert.deepStrictEqual(diff.addedRows[0], { id: 2, name: 'Bob' });
    assert.strictEqual(diff.removedRows.length, 0);
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should identify removed rows by PK', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      [{ id: 1, name: 'Alice' }],
      2, 1,
    );
    assert.strictEqual(diff.removedRows.length, 1);
    assert.deepStrictEqual(diff.removedRows[0], { id: 2, name: 'Bob' });
  });

  it('should identify changed rows with changedColumns', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alicia' }],
      1, 1,
    );
    assert.strictEqual(diff.changedRows.length, 1);
    assert.deepStrictEqual(diff.changedRows[0].changedColumns, ['name']);
    assert.strictEqual(diff.changedRows[0].before.name, 'Alice');
    assert.strictEqual(diff.changedRows[0].after.name, 'Alicia');
  });

  it('should handle tables with no PK (signature mode)', () => {
    const diff = computeTableDiff(
      'logs', ['msg'], [],
      [{ msg: 'a' }, { msg: 'b' }],
      [{ msg: 'b' }, { msg: 'c' }],
      2, 2,
    );
    assert.strictEqual(diff.addedRows.length, 1);
    assert.deepStrictEqual(diff.addedRows[0], { msg: 'c' });
    assert.strictEqual(diff.removedRows.length, 1);
    assert.deepStrictEqual(diff.removedRows[0], { msg: 'a' });
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should handle no differences', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alice' }],
      1, 1,
    );
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 0);
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should handle empty inputs', () => {
    const diff = computeTableDiff('t', ['id'], ['id'], [], [], 0, 0);
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 0);
  });

  it('should handle duplicate rows in signature mode', () => {
    const diff = computeTableDiff(
      'logs', ['msg'], [],
      [{ msg: 'a' }, { msg: 'a' }],
      [{ msg: 'a' }],
      2, 1,
    );
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 1);
  });
});
