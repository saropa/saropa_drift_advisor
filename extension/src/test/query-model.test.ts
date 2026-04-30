/**
 * Tests for query builder model mutation helpers.
 */
import * as assert from 'assert';
import type { ColumnMetadata } from '../api-client';
import {
  createEmptyQueryModel,
  createTableInstance,
  removeTableInstance,
} from '../query-builder/query-model';

const cols: ColumnMetadata[] = [
  { name: 'id', type: 'INTEGER', pk: true },
  { name: 'name', type: 'TEXT', pk: false },
];

describe('query-model', () => {
  it('creates unique aliases for self-join instances', () => {
    const model = createEmptyQueryModel();
    const a = createTableInstance(model, 'contacts', cols);
    model.tables.push(a);
    const b = createTableInstance(model, 'contacts', cols);
    model.tables.push(b);
    assert.notStrictEqual(a.alias, b.alias);
    assert.strictEqual(model.tables.length, 2);
  });

  it('removes dependent state when table instance is removed', () => {
    const model = createEmptyQueryModel();
    const left = createTableInstance(model, 'contacts', cols);
    const right = createTableInstance(model, 'contacts', cols);
    model.tables.push(left, right);
    model.joins.push({
      id: 'j1',
      leftTableId: left.id,
      leftColumn: 'id',
      rightTableId: right.id,
      rightColumn: 'id',
      type: 'LEFT',
    });
    model.selectedColumns.push({ tableId: left.id, column: 'name' });
    model.filters.push({
      id: 'f1',
      tableId: left.id,
      column: 'name',
      operator: 'LIKE',
      value: '%ali%',
      conjunction: 'AND',
    });
    model.groupBy.push({ tableId: left.id, column: 'name' });
    model.orderBy.push({ tableId: left.id, column: 'name', direction: 'ASC' });

    removeTableInstance(model, left.id);
    assert.strictEqual(model.tables.length, 1);
    assert.strictEqual(model.joins.length, 0);
    assert.strictEqual(model.selectedColumns.length, 0);
    assert.strictEqual(model.filters.length, 0);
    assert.strictEqual(model.groupBy.length, 0);
    assert.strictEqual(model.orderBy.length, 0);
  });
});
